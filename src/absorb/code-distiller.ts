import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import TypeScript from 'tree-sitter-typescript';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { getDb } from '../db/connection.js';
import { logger } from '../utils/logger.js';

const parser = new Parser();

export async function absorbCodebase(rootPath: string, projectRoot: string) {
  const db = getDb();
  const files = getAllFiles(rootPath).filter(f => f.match(/\.(js|ts|tsx|jsx)$/));

  logger.info('codebase', `Absorbing ${files.length} code files from ${rootPath}`);

  for (const file of files) {
    const relativePath = relative(projectRoot, file);
    const content = readFileSync(file, 'utf-8');
    
    // Choose parser
    try {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        // @ts-ignore
        parser.setLanguage(TypeScript.typescript);
      } else {
        // @ts-ignore
        parser.setLanguage(JavaScript);
      }
    } catch (e) {
       // Fallback for different export styles
       try {
         if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            // @ts-ignore
            parser.setLanguage(TypeScript.typescript.language);
         } else {
            // @ts-ignore
            parser.setLanguage(JavaScript.language);
         }
       } catch (e2) {
         logger.error('codebase', `Could not set language for ${file}`, { error: (e2 as Error).message });
         continue;
       }
    }

    try {
      const tree = parser.parse(content);
      const symbols = extractSymbols(tree.rootNode, content, relativePath);
      
      // Store symbols
      for (const sym of symbols) {
        db.prepare(`
          INSERT OR REPLACE INTO code_symbols (file_path, name, type, start_line, end_line, content, docstring, signature)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(sym.file_path, sym.name, sym.type, sym.start_line, sym.end_line, sym.content, sym.docstring, sym.signature);
      }

      // Extract and store relationships (calls, imports)
      const relationships = extractRelationships(tree.rootNode, relativePath);
      for (const rel of relationships) {
        // Find from_symbol_id
        const fromSym = db.prepare('SELECT id FROM code_symbols WHERE file_path = ? AND start_line <= ? AND end_line >= ? AND type != \'import\' LIMIT 1')
          .get(relativePath, rel.line, rel.line) as any;
        
        if (fromSym) {
          db.prepare(`
            INSERT INTO code_relationships (from_symbol_id, to_name, type, file_path)
            VALUES (?, ?, ?, ?)
          `).run(fromSym.id, rel.to_name, rel.type, relativePath);
        }
      }
      
      logger.info('codebase', `Analyzed ${relativePath}: ${symbols.length} symbols, ${relationships.length} relationships`);
    } catch (err) {
      logger.error('codebase', `Failed to parse ${relativePath}`, { error: (err as Error)?.message });
    }
  }
}

function getAllFiles(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir);
  files.forEach(file => {
    const filePath = join(dir, file);
    if (file === 'node_modules' || file === '.git' || file === 'dist') return;
    if (statSync(filePath).isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });
  return fileList;
}

function extractSymbols(node: Parser.SyntaxNode, content: string, filePath: string): any[] {
  const symbols: any[] = [];
  
  const visit = (n: Parser.SyntaxNode) => {
    if (n.type === 'function_declaration' || n.type === 'method_definition' || n.type === 'class_declaration') {
      const nameNode = n.childForFieldName('name');
      if (nameNode) {
        symbols.push({
          file_path: filePath,
          name: nameNode.text,
          type: n.type.replace('_declaration', '').replace('_definition', ''),
          start_line: n.startPosition.row + 1,
          end_line: n.endPosition.row + 1,
          content: n.text.slice(0, 1000), // snippet
          signature: n.text.split('{')[0].trim(),
          docstring: '' // TODO: extract comments above
        });
      }
    }
    n.children.forEach(visit);
  };
  
  visit(node);
  return symbols;
}

function extractRelationships(node: Parser.SyntaxNode, filePath: string): any[] {
  const rels: any[] = [];
  
  const visit = (n: Parser.SyntaxNode) => {
    // Function calls
    if (n.type === 'call_expression') {
      const functionNode = n.childForFieldName('function');
      if (functionNode) {
        rels.push({
          to_name: functionNode.text,
          type: 'calls',
          line: n.startPosition.row + 1
        });
      }
    }
    // Imports
    if (n.type === 'import_statement' || n.type === 'lexical_declaration') {
        // Simplified import tracking
        if (n.text.includes('import')) {
             rels.push({
                to_name: n.text,
                type: 'imports',
                line: n.startPosition.row + 1
             });
        }
    }
    n.children.forEach(visit);
  };
  
  visit(node);
  return rels;
}
