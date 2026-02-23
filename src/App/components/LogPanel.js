import { useRef, useEffect } from 'react';
import styled from '@emotion/styled';
import { FieldSet, Button } from 'nexus-module';

const LogContainer = styled.div({
  height: 220,
  overflowY: 'auto',
  background: 'rgba(0,0,0,0.3)',
  borderRadius: 4,
  padding: '6px 10px',
  fontFamily: 'monospace',
  fontSize: 11,
  lineHeight: 1.6,
  border: '1px solid rgba(255,255,255,0.06)',
});

const LogEntry = styled.div(({ level }) => ({
  color: level === 'error' ? '#f44336'  :
         level === 'warn'  ? '#ff9800'  :
         level === 'info'  ? '#ddd'     : '#888',
}));

const LevelTag = styled.span(({ level }) => ({
  display: 'inline-block',
  width: 34,
  marginRight: 6,
  color: level === 'error' ? '#f44336' :
         level === 'warn'  ? '#ff9800' :
         level === 'info'  ? '#81d4fa' : '#888',
  fontWeight: 700,
  textTransform: 'uppercase',
  fontSize: 10,
}));

const HeaderRow = styled.div({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 4,
});

export default function LogPanel({ logs }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <FieldSet legend="Activity Log">
      <HeaderRow>
        <span style={{ fontSize: 11, color: '#666' }}>{logs.length} entries</span>
      </HeaderRow>
      <LogContainer>
        {logs.length === 0 && (
          <div style={{ color: '#555', paddingTop: 8 }}>No log entries yet</div>
        )}
        {logs.map((entry, i) => (
          <LogEntry key={i} level={entry.level}>
            <span style={{ color: '#555', marginRight: 8 }}>{entry.time}</span>
            <LevelTag level={entry.level}>{entry.level.slice(0, 3)}</LevelTag>
            {entry.message}
          </LogEntry>
        ))}
        <div ref={bottomRef} />
      </LogContainer>
    </FieldSet>
  );
}
