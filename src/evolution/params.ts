import { readFileSync, writeFileSync, existsSync } from 'fs';
import { config } from '../config.js';
import { logEvolution } from './changelog.js';

interface EvolutionParams {
  routing_weights: Record<string, Record<string, number>>;
  source_reputation: Record<string, number>;
  reformulation_patterns: string[];
}

const MAX_DRIFT_PER_SESSION = 0.05;
const MAX_TOTAL_DRIFT = 0.30;
const MAX_REPUTATION_INFLUENCE = 0.20;

let sessionDrifts: Record<string, number> = {};

function loadDefaults(): EvolutionParams {
  return {
    routing_weights: {
      news: { duckduckgo: 1.0, exa: 0.5, serper: 0.2 },
      academic: { exa: 1.0, duckduckgo: 0.6, serper: 0.3 },
      general: { duckduckgo: 1.0, exa: 0.7, serper: 0.3 },
      code: { duckduckgo: 0.8, exa: 0.9, serper: 0.2 },
    },
    source_reputation: {},
    reformulation_patterns: [],
  };
}

export function loadParams(): EvolutionParams {
  if (!existsSync(config.evolutionPath)) return loadDefaults();
  try {
    return JSON.parse(readFileSync(config.evolutionPath, 'utf-8'));
  } catch {
    return loadDefaults();
  }
}

function saveParams(params: EvolutionParams): void {
  writeFileSync(config.evolutionPath, JSON.stringify(params, null, 2));
}

export function updateRoutingWeight(queryType: string, provider: string, delta: number): boolean {
  const params = loadParams();
  const defaults = loadDefaults();

  const driftKey = `${queryType}:${provider}`;
  const currentSessionDrift = sessionDrifts[driftKey] || 0;

  if (Math.abs(currentSessionDrift + delta) > MAX_DRIFT_PER_SESSION) {
    return false;
  }

  if (!params.routing_weights[queryType]) params.routing_weights[queryType] = {};
  const currentValue = params.routing_weights[queryType][provider] || 0.5;
  const defaultValue = defaults.routing_weights[queryType]?.[provider] || 0.5;
  const newValue = Math.max(0, Math.min(1, currentValue + delta));

  if (Math.abs(newValue - defaultValue) > MAX_TOTAL_DRIFT) {
    return false;
  }

  const oldStr = currentValue.toFixed(3);
  params.routing_weights[queryType][provider] = newValue;
  sessionDrifts[driftKey] = currentSessionDrift + delta;
  saveParams(params);

  logEvolution({
    change_type: 'routing',
    tier: 'silent',
    parameter: `${queryType}:${provider}`,
    old_value: oldStr,
    new_value: newValue.toFixed(3),
    reason: `Performance-based adjustment (delta: ${delta.toFixed(3)})`,
  });

  return true;
}

export function updateSourceReputation(domain: string, score: number): void {
  const params = loadParams();
  const oldScore = params.source_reputation[domain];
  const clampedScore = Math.max(0.5 - MAX_REPUTATION_INFLUENCE, Math.min(0.5 + MAX_REPUTATION_INFLUENCE + 0.3, score));

  params.source_reputation[domain] = clampedScore;
  saveParams(params);

  logEvolution({
    change_type: 'reputation',
    tier: 'silent',
    parameter: domain,
    old_value: oldScore?.toFixed(2) || 'none',
    new_value: clampedScore.toFixed(2),
    reason: 'Observed quality in research results',
  });
}

export function resetParam(paramName: string): void {
  const params = loadParams();
  const defaults = loadDefaults();

  if (paramName === 'routing_weights') {
    params.routing_weights = defaults.routing_weights;
  } else if (paramName === 'source_reputation') {
    params.source_reputation = {};
  } else if (paramName === 'reformulation_patterns') {
    params.reformulation_patterns = [];
  }

  saveParams(params);
  sessionDrifts = {};

  logEvolution({
    change_type: 'reset',
    tier: 'approval',
    parameter: paramName,
    old_value: 'custom',
    new_value: 'defaults',
    reason: 'Manual reset by user',
    approved_by: 'user',
  });
}

export function resetSessionDrifts(): void {
  sessionDrifts = {};
}
