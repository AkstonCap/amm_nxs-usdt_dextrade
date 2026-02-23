import { useState } from 'react';
import styled from '@emotion/styled';
import { FieldSet, TextField, Button, showSuccessDialog, showErrorDialog } from 'nexus-module';
import { useDispatch, useSelector } from 'react-redux';
import { setBotUrl } from 'actions/actionCreators';

const Row = styled.div({
  display: 'flex',
  gap: 10,
  alignItems: 'flex-end',
  marginTop: 8,
});

const Info = styled.p({
  fontSize: 12,
  color: '#888',
  margin: '4px 0 10px',
  lineHeight: 1.5,
});

const Code = styled.code({
  background: 'rgba(255,255,255,0.08)',
  padding: '1px 6px',
  borderRadius: 3,
  fontSize: 11,
  color: '#81d4fa',
});

export default function SettingsPanel({ onTestConnection }) {
  const dispatch = useDispatch();
  const botUrl = useSelector((s) => s.settings.ammConfig.botUrl);
  const [draft, setDraft] = useState(botUrl);
  const [testing, setTesting] = useState(false);

  async function handleSave() {
    dispatch(setBotUrl(draft));
  }

  async function handleTest() {
    setTesting(true);
    try {
      const result = await onTestConnection(draft);
      showSuccessDialog({
        message: 'Bot connected',
        note: `Bot status: ${result.status}\nUptime: ${result.uptime?.toFixed(1)}s`,
      });
    } catch (e) {
      showErrorDialog({
        message: 'Cannot reach bot server',
        note: e.message + '\n\nMake sure the bot is running:\n  cd bot && npm install && node index.js',
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <FieldSet legend="Connection Settings">
      <Info>
        The bot runs as a local Node.js process on your machine and exposes a REST API
        that this module connects to. Start it with:
      </Info>
      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 4, padding: '8px 12px', marginBottom: 10 }}>
        <Code>cd bot && cp .env.example .env</Code>
        <br />
        <Code style={{ display: 'inline-block', marginTop: 4 }}>
          {'# Edit bot/.env with your dex-trade.com API keys'}
        </Code>
        <br />
        <Code style={{ display: 'inline-block', marginTop: 4 }}>npm install && node index.js</Code>
      </div>
      <Info>
        Get your API keys from your{' '}
        <Button skin="hyperlink" as="a" href="https://dex-trade.com/profile/api" style={{ fontSize: 12 }}>
          dex-trade.com profile → API
        </Button>{' '}
        page. Set <Code>DEXTRADE_LOGIN_TOKEN</Code> and <Code>DEXTRADE_SECRET</Code> in <Code>bot/.env</Code>.
      </Info>

      <label style={{ fontSize: 11, color: '#aaa', display: 'block', marginBottom: 4 }}>
        Bot Server URL
      </label>
      <Row>
        <TextField
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="http://127.0.0.1:17442"
          style={{ flex: 1 }}
        />
        <Button onClick={handleSave} disabled={draft === botUrl}>
          Save
        </Button>
        <Button onClick={handleTest} disabled={testing}>
          {testing ? 'Testing…' : 'Test'}
        </Button>
      </Row>
    </FieldSet>
  );
}
