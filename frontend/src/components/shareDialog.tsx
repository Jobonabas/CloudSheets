import { useState, useCallback, type SyntheticEvent } from 'react';

interface ShareDialogProps {
    sheetId: string;
    sheetTitle: string;
    apiUrl: string;
    token?: string;
    onClose: () => void;
    onShare: () => void;
}

interface ShareState {
    email: string;
    role: 'viewer' | 'editor';
}

export default function ShareDialog({ sheetId, sheetTitle, apiUrl, token, onClose, onShare }: ShareDialogProps) {
    const [state, setState] = useState<ShareState>({ email: '', role: 'viewer'});
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = useCallback(async (event: SyntheticEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${apiUrl}/sheets/${sheetId}/share`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    id: sheetId,
                    email: state.email.trim(),
                    role: state.role,
                })
            });

            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.message ?? `HTTP ${response.status}`);
            }

            setSuccess(true);
            onShare();
            setTimeout(() => {
                onClose();
            }, 2000);
        } catch(err){
            setError(err instanceof Error ? err.message : 'Unknown Error');
        } finally {
            setLoading(false);
        }
    }, [apiUrl, sheetId, token, state.email, state.role, onClose, onShare]);

    return (
        <div className="share-dialog-overlay" onClick={onClose}>
        <div className="share-dialog" onClick={(event) => event.stopPropagation()}>
            <h2>Teilen: {sheetTitle}</h2>

            <form onSubmit={handleSubmit}>
            <label>
                E-Mail-Adresse
                <input
                type="email"
                value={state.email}
                onChange={(event) => setState((previousState) => ({ ...previousState, email: event.target.value }))}
                required
                placeholder="person@example.com"
                />
            </label>

            <label>
                Role
                <select
                value={state.role}
                onChange={(event) => setState((previousState) => ({ ...previousState, role: event.target.value as 'viewer' | 'editor' }))}
                >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                </select>
            </label>

            {error && <p className="share-error">{error}</p>}
            {success && <p className="share-success">Erfolgreich mit {state.email} geteilt!</p>}

            <div className="share-actions">
                <button type="button" className="btn btn--outline" onClick={onClose} disabled={loading}>
                Cancel
                </button>
                <button type="submit" className="btn btn--primary" disabled={loading || !state.email}>
                {loading ? 'Wird geteilt …' : 'Share'}
                </button>
            </div>
            </form>
        </div>
        </div>
    );
}
