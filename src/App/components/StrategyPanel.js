import { useState } from 'react';
import styled from '@emotion/styled';
import { Button, FieldSet, TextField } from 'nexus-module';
import { useDispatch, useSelector } from 'react-redux';
import {
  setStrategy,
  setStrategyParam,
  resetStrategyParams,
} from 'actions/actionCreators';
import OrderPreview from './OrderPreview';

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

const LabelRow = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
});

const InfoWrapper = styled.div({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  '&:hover > div': {
    display: 'block',
  },
});

const InfoIcon = styled.button({
  width: 18,
  height: 18,
  minWidth: 18,
  borderRadius: '50%',
  border: '1px solid rgba(120,170,255,0.5)',
  background: 'transparent',
  color: '#7899c7',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'default',
  padding: 0,
  '&:hover': {
    background: 'rgba(100,160,255,0.2)',
    color: '#9fc5ff',
  },
});

const InfoPanel = styled.div({
  display: 'none',
  position: 'absolute',
  top: 'calc(100% + 4px)',
  right: 0,
  zIndex: 20,
  width: 230,
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid rgba(120,170,255,0.3)',
  background: 'rgba(20,30,50,0.97)',
  boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
  color: '#ffffff',
  fontSize: 11,
  lineHeight: 1.5,
  pointerEvents: 'none',
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

export default function StrategyPanel({ strategies, botStatus, market, balances, onStart, onStop, onForceRebalance }) {
  const dispatch = useDispatch();
  const ammConfig = useSelector((s) => s.settings.ammConfig);
  const { strategyName, strategyParams } = ammConfig;

  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const isRunning = botStatus.status !== 'stopped' && botStatus.status != null;
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
                <LabelRow>
                  <Label htmlFor={`param-${key}`}>{schema.label}</Label>
                  <InfoWrapper>
                    <InfoIcon
                      type="button"
                      aria-label={`More info about ${schema.label}`}
                    >
                      i
                    </InfoIcon>
                    <InfoPanel>
                      {schema.description || schema.label}
                    </InfoPanel>
                  </InfoWrapper>
                </LabelRow>
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

          {/* Live order preview */}
          <OrderPreview
            strategyName={strategyName}
            strategyParams={{ ...currentStrategy.defaultParams, ...strategyParams }}
            market={market}
            balances={balances}
          />
        </>
      )}

      {/* Control buttons */}
      <ActionRow>
        {isRunning ? (
          <>
            <Button
              skin="default"
              onClick={onForceRebalance}
              style={{ fontSize: 12, background: 'rgba(80,100,140,0.4)', color: '#c8d8f0', border: '1px solid rgba(120,160,255,0.4)' }}
            >
              Force Rebalance
            </Button>
            <Button
              skin="error"
              onClick={handleStop}
              disabled={stopping}
              style={{ background: 'rgba(180,40,40,0.75)', color: '#fff', border: '1px solid rgba(255,80,80,0.5)' }}
            >
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
