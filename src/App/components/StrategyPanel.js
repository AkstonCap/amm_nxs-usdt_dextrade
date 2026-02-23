import { useState } from 'react';
import styled from '@emotion/styled';
import { Button, FieldSet, TextField } from 'nexus-module';
import { useDispatch, useSelector } from 'react-redux';
import {
  setStrategy,
  setStrategyParam,
  resetStrategyParams,
} from 'actions/actionCreators';

const Grid = styled.div({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: 12,
  marginTop: 8,
});

const ParamRow = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

const Label = styled.label({
  fontSize: 11,
  color: '#aaa',
  fontWeight: 500,
});

const StrategySelect = styled.div({
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  marginBottom: 12,
});

const StrategyBtn = styled(Button)(({ active }) => ({
  flex: '1 1 140px',
  justifyContent: 'center',
  background: active ? 'rgba(100,160,255,0.18)' : undefined,
  border: active ? '1px solid rgba(100,160,255,0.5)' : undefined,
}));

const ActionRow = styled.div({
  display: 'flex',
  gap: 8,
  marginTop: 14,
  justifyContent: 'flex-end',
});

export default function StrategyPanel({ strategies, botStatus, onStart, onStop, onForceRebalance }) {
  const dispatch = useDispatch();
  const ammConfig = useSelector((s) => s.settings.ammConfig);
  const { strategyName, strategyParams } = ammConfig;

  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const isRunning = botStatus.status === 'running' || botStatus.status === 'paused';
  const currentStrategy = strategies.find((s) => s.name === strategyName);

  function handleStrategySelect(strat) {
    dispatch(setStrategy(strat.name, strat.defaultParams));
  }

  function handleParamChange(key, rawValue, schema) {
    let value = rawValue;
    if (schema.type === 'number') {
      value = parseFloat(rawValue);
      if (isNaN(value)) value = rawValue;
    }
    dispatch(setStrategyParam(key, value));
  }

  async function handleStart() {
    setStarting(true);
    try { await onStart(strategyName, strategyParams); }
    finally { setStarting(false); }
  }

  async function handleStop() {
    setStopping(true);
    try { await onStop(); }
    finally { setStopping(false); }
  }

  return (
    <FieldSet legend="Strategy & Controls">
      {/* Strategy selector */}
      <StrategySelect>
        {strategies.map((s) => (
          <StrategyBtn
            key={s.name}
            skin="default"
            active={s.name === strategyName ? 1 : 0}
            onClick={() => handleStrategySelect(s)}
            disabled={isRunning}
            title={s.description}
          >
            {s.displayName}
          </StrategyBtn>
        ))}
      </StrategySelect>

      {currentStrategy && (
        <>
          <p style={{ fontSize: 12, color: '#aaa', margin: '0 0 10px' }}>
            {currentStrategy.description}
          </p>

          {/* Parameter inputs */}
          <Grid>
            {Object.entries(currentStrategy.paramSchema).map(([key, schema]) => (
              <ParamRow key={key}>
                <Label htmlFor={`param-${key}`}>{schema.label}</Label>
                <TextField
                  id={`param-${key}`}
                  type="number"
                  min={schema.min}
                  max={schema.max}
                  step={schema.step}
                  value={strategyParams[key] ?? currentStrategy.defaultParams[key]}
                  onChange={(e) => handleParamChange(key, e.target.value, schema)}
                  disabled={isRunning}
                />
              </ParamRow>
            ))}
          </Grid>

          {!isRunning && (
            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <Button
                skin="hyperlink"
                style={{ fontSize: 11 }}
                onClick={() => dispatch(resetStrategyParams(currentStrategy.defaultParams))}
              >
                Reset to defaults
              </Button>
            </div>
          )}
        </>
      )}

      {/* Control buttons */}
      <ActionRow>
        {isRunning ? (
          <>
            <Button skin="default" onClick={onForceRebalance} style={{ fontSize: 12 }}>
              Force Rebalance
            </Button>
            <Button skin="error" onClick={handleStop} disabled={stopping}>
              {stopping ? 'Stopping…' : 'Stop Bot'}
            </Button>
          </>
        ) : (
          <Button skin="primary" onClick={handleStart} disabled={starting || strategies.length === 0}>
            {starting ? 'Starting…' : 'Start Bot'}
          </Button>
        )}
      </ActionRow>

      {botStatus.status === 'error' && botStatus.errorMessage && (
        <div style={{ color: '#f44336', fontSize: 12, marginTop: 8 }}>
          Error: {botStatus.errorMessage}
        </div>
      )}
    </FieldSet>
  );
}
