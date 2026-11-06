import { useCallback, useEffect, useMemo, useState } from 'react';
import { PlanDraft, redactionProblem, type ChainFact, type ConfirmedPlan } from '@preflight/shared/hygiene';
import { ALIASES, DEPLOYMENT, TOKEN_LABEL, readFact } from './chain.js';
import { confirmDraft, deriveFinding, fmt, loadPlan, savePlan } from './plan.js';
import { buildRevoke, connect, sendRevoke, switchToLocal, waitReceipt, type RevokePreview } from './wallet.js';
import { extractPlan, type InferenceOutcome } from './inference.js';
import { MemoryPanel } from './MemoryPanel.js';

const DEFAULT_TEXT = 'Move 800 USDC to my repayment wallet B to repay 500 USDC.';
const EMPTY_DRAFT: PlanDraft = { sourceAlias: 'A', destinationAlias: 'B', token: 'USDC', fundingAmount: '', repaymentAmount: null };

type RevokeState =
  | { step: 'idle' }
  | { step: 'previewed'; preview: RevokePreview }
  | { step: 'sending'; preview: RevokePreview }
  | { step: 'confirming'; preview: RevokePreview; hash: string }
  | { step: 'done'; hash: string; block: string; allowanceAfter: string }
  | { step: 'error'; message: string; preview?: RevokePreview };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function App() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [draftSource, setDraftSource] = useState<'manual' | '0g'>('manual');
  const [inference, setInference] = useState<InferenceOutcome | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [plan, setPlan] = useState<ConfirmedPlan | null>(() => loadPlan());
  const [fact, setFact] = useState<ChainFact | null>(null);
  const [factError, setFactError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [wallet, setWallet] = useState<{ account: string; chainId: number } | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<RevokeState>({ step: 'idle' });

  const refresh = useCallback(async (p: ConfirmedPlan | null) => {
    if (!p) return;
    setReading(true);
    const r = await readFact(p.destinationWallet as `0x${string}`);
    setReading(false);
    if (r.ok) {
      setFact(r.fact);
      setFactError(null);
    } else {
      setFact(null);
      setFactError(r.reason);
    }
  }, []);

  // Recheck a stored plan on open. No background polling.
  useEffect(() => {
    void refresh(plan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finding = useMemo(() => (plan && plan.status === 'confirmed' ? deriveFinding(plan, fact) : null), [plan, fact]);

  async function onExtract() {
    const problem = redactionProblem(text);
    if (problem) {
      setInference({ ok: false, error: problem });
      return;
    }
    setExtracting(true);
    const r = await extractPlan(text);
    setExtracting(false);
    setInference(r);
    if (r.ok) {
      setDraft(r.draft);
      setDraftSource('0g');
    }
  }

  function onConfirm() {
    if (!draft) return;
    const parsed = PlanDraft.safeParse(draft);
    if (!parsed.success) return;
    const receiptRef = draftSource === '0g' && inference?.ok ? (inference.receipt.requestId ?? undefined) : undefined;
    const next = confirmDraft(parsed.data, plan, draftSource, receiptRef);
    setPlan(next);
    savePlan(next);
    setDraft(null);
    setRevoke({ step: 'idle' });
    void refresh(next);
  }

  function onCancelPlan() {
    setPlan(null);
    savePlan(null);
    setFact(null);
    setRevoke({ step: 'idle' });
  }

  async function onConnect() {
    setWalletError(null);
    try {
      setWallet(await connect());
    } catch (e) {
      setWalletError((e as Error).message);
    }
  }

  async function onSwitch() {
    setWalletError(null);
    try {
      await switchToLocal();
      setWallet(await connect());
    } catch (e) {
      setWalletError((e as Error).message);
    }
  }

  async function onSend(preview: RevokePreview) {
    setRevoke({ step: 'sending', preview });
    try {
      const hash = await sendRevoke(preview);
      setRevoke({ step: 'confirming', preview, hash });
      const receipt = await waitReceipt(hash);
      if (receipt.status !== 'success') throw new Error(`Revoke transaction ${short(hash)} reverted`);
      const after = await readFact(preview.from);
      if (!after.ok) throw new Error(`Receipt confirmed but allowance reread failed: ${after.reason}`);
      setFact(after.fact);
      setRevoke({ step: 'done', hash, block: receipt.blockNumber.toString(), allowanceAfter: after.fact.allowanceRaw });
    } catch (e) {
      const msg = (e as Error).message.split('\n')[0] ?? 'Wallet request failed';
      // Cancellation changes no plan or consent state.
      setRevoke({ step: 'error', message: /reject|denied|cancel/i.test(msg) ? 'Request cancelled in wallet. Nothing was sent.' : msg, preview });
    }
  }

  const destination = plan?.destinationWallet;
  const ownerMatches = !!wallet && !!destination && wallet.account.toLowerCase() === destination.toLowerCase();
  const chainMatches = wallet?.chainId === DEPLOYMENT.chainId;
  const canPrepare = finding?.kind === 'finding' && finding.finding.proposedAction === 'revoke-before-funding';

  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <h1 className="wordmark">Preflight</h1>
          <p className="tagline">Checks your plan against open allowances before the money moves.</p>
        </div>
        <dl className="env" aria-label="Data source">
          <div>
            <dt>Chain</dt>
            <dd>31337, local EVM</dd>
          </div>
          <div>
            <dt>Token</dt>
            <dd>{TOKEN_LABEL}</dd>
          </div>
        </dl>
      </header>

      <ol className="checklist">
        {/* 1. Plan */}
        <li className="strip">
          <h2>
            <span className="step">1</span> Say what you plan to do
          </h2>
          {plan ? (
            <div className="confirmed">
              <p>
                Confirmed plan, revision {plan.revision}: move <strong>{fmt(plan.incomingRaw)} fUSDC</strong> from A{' '}
                <code title={plan.sourceWallet}>{short(plan.sourceWallet)}</code> to B{' '}
                <code title={plan.destinationWallet}>{short(plan.destinationWallet)}</code>
                {plan.repaymentRaw !== '0' && <>, then repay {fmt(plan.repaymentRaw)} fUSDC (your stated intent; no debt was read on chain)</>}.
              </p>
              <p className="meta">
                Entered {plan.inputSource === '0g' ? 'from 0G extraction' : 'manually'}
                {plan.inferenceReceiptRef && <>, request {plan.inferenceReceiptRef}</>}. Confirmed {new Date(plan.confirmedAt!).toLocaleTimeString()}.
              </p>
              <div className="actions">
                <button type="button" onClick={() => setDraft({ sourceAlias: 'A', destinationAlias: 'B', token: 'USDC', fundingAmount: fmt(plan.incomingRaw), repaymentAmount: plan.repaymentRaw === '0' ? null : fmt(plan.repaymentRaw) })}>
                  Edit plan
                </button>
                <button type="button" className="quiet" onClick={onCancelPlan}>
                  Cancel plan
                </button>
              </div>
            </div>
          ) : (
            <>
              <label htmlFor="plan-text">Describe the move using wallet aliases A and B</label>
              <textarea id="plan-text" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
              <p className="meta">Only this sentence goes to the 0G model. Wallet addresses stay in this browser.</p>
              <div className="actions">
                <button type="button" onClick={onExtract} disabled={extracting}>
                  {extracting ? 'Reading…' : 'Read with 0G'}
                </button>
                <button type="button" className="quiet" onClick={() => { setDraft(EMPTY_DRAFT); setDraftSource('manual'); }}>
                  Enter manually
                </button>
              </div>
              {inference && !inference.ok && (
                <p className="notice" role="alert">
                  0G extraction unavailable: {inference.error}. Enter the plan manually instead.
                </p>
              )}
            </>
          )}

          <MemoryPanel
            plan={plan}
            onRestored={(p) => {
              setPlan(p);
              savePlan(p);
              setRevoke({ step: 'idle' });
              void refresh(p);
            }}
            onForgetLocal={() => {
              setPlan(null);
              savePlan(null);
              setFact(null);
              setRevoke({ step: 'idle' });
            }}
          />

          {draft && (
            <DraftEditor
              draft={draft}
              source={draftSource}
              inference={inference}
              onChange={(d) => { setDraft(d); }}
              onConfirm={onConfirm}
              onDiscard={() => setDraft(null)}
            />
          )}
        </li>

        {/* 2. Facts */}
        <li className={`strip ${plan ? '' : 'dim'}`}>
          <h2>
            <span className="step">2</span> Read the destination wallet
          </h2>
          {!plan && <p className="meta">Confirm a plan first.</p>}
          {plan && (
            <>
              {fact ? (
                <dl className="facts">
                  <div><dt>Owner (B)</dt><dd><code>{fact.owner}</code></dd></div>
                  <div><dt>Spender (S)</dt><dd><code>{fact.spender}</code></dd></div>
                  <div><dt>Token</dt><dd><code>{fact.token}</code>, {fact.decimals} decimals</dd></div>
                  <div><dt>Balance of B</dt><dd className="num">{fmt(fact.balanceRaw)} fUSDC</dd></div>
                  <div><dt>Allowance B → S</dt><dd className="num">{fmt(fact.allowanceRaw)} fUSDC</dd></div>
                  <div><dt>Block</dt><dd>{fact.blockNumber}, <code title={fact.blockHash}>{short(fact.blockHash)}</code></dd></div>
                  <div><dt>Read at</dt><dd>{new Date(fact.fetchedAt).toLocaleTimeString()}, {fact.source}</dd></div>
                </dl>
              ) : (
                <p className="notice" role="status">Unknown: {factError ?? 'not read yet'}. Unknown is never treated as safe.</p>
              )}
              <div className="actions">
                <button type="button" className="quiet" onClick={() => refresh(plan)} disabled={reading}>
                  {reading ? 'Reading…' : 'Read again'}
                </button>
              </div>
            </>
          )}
        </li>

        {/* 3. Finding */}
        <li className={`strip ${finding?.kind === 'finding' ? '' : 'dim'}`}>
          <h2>
            <span className="step">3</span> What this funding would expose
          </h2>
          {!finding && <p className="meta">Needs a confirmed plan and a fresh chain read.</p>}
          {finding?.kind === 'unknown' && <p className="notice" role="status">Exposure unknown: {finding.reason}.</p>}
          {finding?.kind === 'finding' && (
            <div className={`gauge ${finding.finding.proposedAction === 'revoke-before-funding' ? 'caution' : 'clear'}`} role="status">
              <div className="readout">
                <div>
                  <span className="figure">{fmt(finding.finding.currentExposureRaw)}</span>
                  <span className="unit">fUSDC exposed now</span>
                </div>
                <span className="arrow" aria-hidden="true" />
                <div>
                  <span className="figure">{fmt(finding.finding.conditionalExposureRaw)}</span>
                  <span className="unit">after this funding</span>
                </div>
              </div>
              <p>{finding.finding.explanation}</p>
              <details>
                <summary>How this is worked out</summary>
                <p>
                  now = min(balance, allowance); after = min(balance + incoming, allowance), in integer base units. Rule {finding.finding.ruleVersion}, plan revision{' '}
                  {finding.finding.planRevision}, fact {finding.finding.factIds[0]}.
                </p>
                <ul>
                  {finding.finding.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        </li>

        {/* 4. Revoke */}
        <li className={`strip ${canPrepare || revoke.step === 'done' ? '' : 'dim'}`}>
          <h2>
            <span className="step">4</span> Revoke this allowance from B before funding B
          </h2>
          {revoke.step === 'done' ? (
            <div className="cleared" role="status">
              <p>
                Allowance revoked. Receipt {short(revoke.hash)} confirmed in block {revoke.block}; a fresh read shows allowance {fmt(revoke.allowanceAfter)} fUSDC.
              </p>
            </div>
          ) : canPrepare ? (
            <>
              <ul className="prereq">
                <li>You control wallet B. Wallet A cannot revoke B's allowance.</li>
                <li>B holds native gas on chain 31337. A zero token balance still needs gas.</li>
                <li>Revoked only after the receipt confirms and a new read shows zero.</li>
              </ul>
              <div className="wallet-row">
                {wallet ? (
                  <p className="meta">
                    Connected <code>{short(wallet.account)}</code> on chain {wallet.chainId}.{' '}
                    {!ownerMatches && <strong>Switch your wallet to account B ({short(destination!)}) to revoke.</strong>}{' '}
                    {!chainMatches && (
                      <button type="button" className="quiet" onClick={onSwitch}>
                        Switch to chain 31337
                      </button>
                    )}
                  </p>
                ) : (
                  <button type="button" className="quiet" onClick={onConnect}>
                    Connect wallet
                  </button>
                )}
                {walletError && <p className="notice" role="alert">{walletError}</p>}
              </div>
              {revoke.step === 'idle' && (
                <button type="button" onClick={() => setRevoke({ step: 'previewed', preview: buildRevoke(destination as `0x${string}`) })}>
                  Prepare revoke
                </button>
              )}
              {'preview' in revoke && revoke.preview && (
                <div className="preview">
                  <h3>Transaction to review</h3>
                  <dl className="facts">
                    <div><dt>From</dt><dd><code>{revoke.preview.from}</code> (B)</dd></div>
                    <div><dt>To</dt><dd><code>{revoke.preview.to}</code> (fUSDC token)</dd></div>
                    <div><dt>Call</dt><dd><code>approve({short(revoke.preview.args.spender)}, 0)</code></dd></div>
                    <div><dt>Value</dt><dd>0</dd></div>
                    <div><dt>Chain</dt><dd>{revoke.preview.chainId}</dd></div>
                  </dl>
                  <div className="actions">
                    <button
                      type="button"
                      onClick={() => onSend(revoke.preview!)}
                      disabled={!ownerMatches || !chainMatches || revoke.step === 'sending' || revoke.step === 'confirming'}
                    >
                      {revoke.step === 'sending' ? 'Waiting for wallet…' : revoke.step === 'confirming' ? 'Waiting for receipt…' : 'Review in wallet'}
                    </button>
                    <button type="button" className="quiet" onClick={() => setRevoke({ step: 'idle' })}>
                      Discard
                    </button>
                  </div>
                  {revoke.step === 'error' && <p className="notice" role="alert">{revoke.message}</p>}
                </div>
              )}
            </>
          ) : (
            <p className="meta">No revoke is proposed for the current plan.</p>
          )}
        </li>

        {/* 5. Fund */}
        <li className={`strip ${revoke.step === 'done' ? '' : 'dim'}`}>
          <h2>
            <span className="step">5</span> Fund B
          </h2>
          {revoke.step === 'done' && plan ? (
            <p>
              Send {fmt(plan.incomingRaw)} fUSDC from A to B as a separate transaction in your wallet. Preflight does not move funds.
            </p>
          ) : (
            <p className="meta">Funding stays your own wallet action. Do it after the revoke confirms.</p>
          )}
        </li>
      </ol>

      <footer className="foot">
        <p>
          Wallets: A <code>{short(ALIASES.A)}</code>, B <code>{short(ALIASES.B)}</code>, spender S <code>{short(DEPLOYMENT.spender)}</code>. The test spender is
          deliberately exercisable; this says nothing about any real contract.
        </p>
      </footer>
    </div>
  );
}

function DraftEditor(props: {
  draft: PlanDraft;
  source: 'manual' | '0g';
  inference: InferenceOutcome | null;
  onChange: (d: PlanDraft) => void;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const { draft, source, inference } = props;
  const valid = PlanDraft.safeParse(draft).success && draft.sourceAlias !== draft.destinationAlias;
  return (
    <form
      className="draft"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) props.onConfirm();
      }}
    >
      <h3>Draft, not yet confirmed</h3>
      {source === '0g' && inference?.ok && (
        <p className="meta">
          Extracted by {inference.receipt.model}, request <code>{inference.receipt.requestId ?? 'none returned'}</code>, requested tier{' '}
          {inference.receipt.requestedTier}. Check every field; model output cannot authorize anything.
        </p>
      )}
      <div className="fields">
        <label>
          From
          <select value={draft.sourceAlias} onChange={(e) => props.onChange({ ...draft, sourceAlias: e.target.value as 'A' | 'B' })}>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
        </label>
        <label>
          To
          <select value={draft.destinationAlias} onChange={(e) => props.onChange({ ...draft, destinationAlias: e.target.value as 'A' | 'B' })}>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
        </label>
        <label>
          Funding (fUSDC)
          <input inputMode="decimal" value={draft.fundingAmount} onChange={(e) => props.onChange({ ...draft, fundingAmount: e.target.value.trim() })} />
        </label>
        <label>
          Repayment you intend (fUSDC)
          <input
            inputMode="decimal"
            value={draft.repaymentAmount ?? ''}
            placeholder="none"
            onChange={(e) => props.onChange({ ...draft, repaymentAmount: e.target.value.trim() === '' ? null : e.target.value.trim() })}
          />
        </label>
      </div>
      <p className="meta">Chain 31337, token fUSDC. Aliases resolve to addresses only in this browser.</p>
      <div className="actions">
        <button type="submit" disabled={!valid}>
          Confirm plan
        </button>
        <button type="button" className="quiet" onClick={props.onDiscard}>
          Discard draft
        </button>
      </div>
    </form>
  );
}
