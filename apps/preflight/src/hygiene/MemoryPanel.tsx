import { useState } from 'react';
import type { ConfirmedPlan } from '@preflight/shared/hygiene';
import {
  ARKIV_EXPLORER,
  EXPIRY_DAYS,
  buildBackup,
  loadPointer,
  localKeyB64,
  parseBackup,
  restorePlanFromArkiv,
  savePlanToArkiv,
  type ArkivPointer,
} from './arkiv.js';
import { DEPLOYMENT } from './chain.js';

const short = (a: string) => `${a.slice(0, 10)}…${a.slice(-6)}`;

export function MemoryPanel(props: { plan: ConfirmedPlan | null; onRestored: (plan: ConfirmedPlan) => void; onForgetLocal: () => void }) {
  const [pointer, setPointer] = useState<ArkivPointer | null>(() => loadPointer());
  const [busy, setBusy] = useState<'save' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoreNote, setRestoreNote] = useState<string | null>(null);
  const [entityInput, setEntityInput] = useState('');

  async function onSave() {
    if (!props.plan) return;
    setBusy('save');
    setError(null);
    try {
      setPointer(await savePlanToArkiv(props.plan));
    } catch (e) {
      const msg = (e as Error).message.split('\n')[0] ?? 'Save failed';
      setError(/reject|denied|cancel/i.test(msg) ? 'Save cancelled in wallet. Nothing was written.' : msg);
    } finally {
      setBusy(null);
    }
  }

  function onDownload() {
    const key = localKeyB64();
    if (!pointer || !key) return;
    const blob = new Blob([JSON.stringify(buildBackup(pointer, key), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `preflight-recovery-${pointer.entityKey.slice(2, 10)}.preflight-backup.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function restore(entityKey: string, keyB64: string | null) {
    setError(null);
    setRestoreNote(null);
    if (!/^0x[0-9a-fA-F]{64}$/.test(entityKey)) return setError('Entity key must be 0x followed by 64 hex characters.');
    if (!keyB64) return setError('No recovery key in this browser. Load your recovery file instead.');
    setBusy('restore');
    const r = await restorePlanFromArkiv(entityKey as `0x${string}`, keyB64);
    setBusy(null);
    if (!r.ok) return setError(r.reason);
    if (r.plan.chainId !== DEPLOYMENT.chainId || r.plan.token.toLowerCase() !== DEPLOYMENT.token.toLowerCase()) {
      return setError('Restored plan is for a different chain or token than this Preflight build. Not loaded.');
    }
    setRestoreNote(
      `Read entity ${short(entityKey)} from Arkiv and decrypted it in this browser. Public attributes: recordType=${r.publicAttributes.recordType}, envelopeVersion=${r.publicAttributes.envelopeVersion}${r.owner ? `, owner ${short(r.owner)}` : ''}.`,
    );
    props.onRestored(r.plan);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const backup = parseBackup(await file.text());
    if (!backup) return setError('That file is not a Preflight recovery file.');
    await restore(backup.entityKey, backup.dataKeyB64url);
  }

  return (
    <section className="memory" aria-labelledby="memory-h">
      <h3 id="memory-h">Encrypted memory on Arkiv</h3>
      {props.plan && !pointer && (
        <>
          <p className="meta">
            Encrypts this confirmed plan in your browser and stores only ciphertext on Arkiv's Rabdi testnet, signed by your wallet. Public: your
            wallet address, timing, size and a generic record type. Expires in {EXPIRY_DAYS} days.
          </p>
          <div className="actions">
            <button type="button" onClick={onSave} disabled={busy !== null}>
              {busy === 'save' ? 'Waiting for wallet…' : 'Save encrypted copy'}
            </button>
          </div>
        </>
      )}
      {pointer && (
        <dl className="facts">
          <div><dt>Entity</dt><dd><code>{pointer.entityKey}</code></dd></div>
          <div>
            <dt>Transaction</dt>
            <dd>
              <a href={`${ARKIV_EXPLORER}/tx/${pointer.txHash}`} target="_blank" rel="noreferrer noopener">
                <code>{short(pointer.txHash)}</code>
              </a>
            </dd>
          </div>
          <div><dt>Writer</dt><dd><code>{pointer.writer}</code></dd></div>
          <div><dt>Expires at block</dt><dd>{pointer.expiresAtBlock}</dd></div>
        </dl>
      )}
      {pointer && (
        <div className="actions">
          <button type="button" className="quiet" onClick={onDownload}>
            Download recovery file
          </button>
          {props.plan && (
            <button type="button" className="quiet" onClick={props.onForgetLocal}>
              Clear local plan
            </button>
          )}
        </div>
      )}
      {!props.plan && (
        <div className="restore">
          <label htmlFor="entity-key">Restore a saved plan by entity key</label>
          <div className="inline">
            <input id="entity-key" value={entityInput} placeholder="0x…" onChange={(e) => setEntityInput(e.target.value.trim())} />
            <button type="button" onClick={() => restore(entityInput || pointer?.entityKey || '', localKeyB64())} disabled={busy !== null}>
              {busy === 'restore' ? 'Reading…' : 'Restore'}
            </button>
          </div>
          {pointer && !entityInput && <p className="meta">Leave empty to use the last saved entity {short(pointer.entityKey)}.</p>}
          <label htmlFor="recovery-file" className="file-label">
            Or load a recovery file
          </label>
          <input id="recovery-file" type="file" accept=".json,application/json" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
      )}
      {restoreNote && <p className="cleared-note" role="status">{restoreNote}</p>}
      {error && <p className="notice" role="alert">{error}</p>}
    </section>
  );
}
