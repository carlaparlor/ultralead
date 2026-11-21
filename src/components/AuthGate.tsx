import { useCallback, useState } from 'react'
import { AlertCircle, Fingerprint, Key, ShieldAlert } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { verifyCode } from '../domain/auth'

const isDesktop = (): boolean =>
  typeof window !== 'undefined' && !!(window as unknown as { __TAURI__?: unknown }).__TAURI__

async function verifyFingerprint(): Promise<void> {
  if (!isDesktop()) throw new Error('Fingerprint verification is only available in the desktop app.')
  await invoke('verify_fingerprint')
}

interface AuthGateProps {
  /** SHA-256 of the configured unlock code, or null when none is set. */
  unlockCodeHash: string | null
  onUnlock: () => void
}

export function AuthGate({ unlockCodeHash, onUnlock }: AuthGateProps) {
  const [method, setMethod] = useState<'fingerprint' | 'code'>(() =>
    unlockCodeHash === null ? 'code' : 'fingerprint')
  const [scanning, setScanning] = useState(false)
  const [readerError, setReaderError] = useState('')
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')

  const scanFingerprint = useCallback(async () => {
    setReaderError('')
    setScanning(true)
    try {
      await verifyFingerprint()
      onUnlock()
    } catch (error) {
      setReaderError(error instanceof Error ? error.message : 'The fingerprint reader could not be reached.')
    } finally {
      setScanning(false)
    }
  }, [onUnlock])

  const unlockWithCode = useCallback(async () => {
    setCodeError('')
    if (unlockCodeHash === null) {
      setCodeError('No unlock code is configured. Set one in Data & settings once the desk is unlocked.')
      return
    }
    if (!(await verifyCode(code, unlockCodeHash))) {
      setCodeError('That is not the unlock code.')
      return
    }
    onUnlock()
  }, [code, unlockCodeHash, onUnlock])

  const active = (name: 'fingerprint' | 'code') => method === name ? 'auth-tab is-on' : 'auth-tab'

  return (
    <div className="auth-gate" aria-label="Desk locked">
      <div className="auth-card">
        <ShieldAlert size={34} className="auth-symbol" />
        <h2 className="auth-heading">Desk locked</h2>
        <p className="auth-intro">
          Nobody can reach your leads, notes or sales until the desk is unlocked.
          Scan your fingerprint on the USB reader, or enter your unlock code.
        </p>
        <div className="auth-tabs">
          <button className={active('fingerprint')} onClick={() => setMethod('fingerprint')}>
            <Fingerprint size={15} /> FINGERPRINT
          </button>
          <button className={active('code')} onClick={() => setMethod('code')}>
            <Key size={15} /> UNLOCK CODE
          </button>
        </div>
        {method === 'fingerprint' && (
          <>
            <button
              className="button button-primary full-button"
              disabled={scanning}
              onClick={scanFingerprint}
            >
              {scanning ? <span>SCANNING FINGERPRINT…</span> : (<>SCAN FINGERPRINT <Fingerprint size={15} /></>)}
            </button>
            {readerError && (
              <div className="auth-error"><AlertCircle size={14} /> {readerError}</div>
            )}
            <p className="auth-note">
              The reader isn&rsquo;t configured on this device yet? Use your unlock code instead, or set one up in
              <strong>Data &amp; settings &rarr; Desk lock</strong>.
            </p>
          </>
        )}
        {method === 'code' && (
          <>
            <input
              className="form-input"
              type="password"
              value={code}
              onChange={event => setCode(event.target.value)}
              placeholder="Unlock code"
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? 'auth-code-error' : undefined}
            />
            {codeError && <div className="form-error" id="auth-code-error">{codeError}</div>}
            <button className="button button-primary full-button" onClick={unlockWithCode}>UNLOCK</button>
            {unlockCodeHash === null && (
              <p className="auth-note">No unlock code is configured yet, so the desk cannot be locked right now.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
