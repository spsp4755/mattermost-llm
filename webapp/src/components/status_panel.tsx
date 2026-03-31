import React, {useEffect, useState} from 'react';

import type {ConnectionStatus, PluginStatus} from '../client';
import {getStatus, testConnection} from '../client';

export default function StatusPanel() {
    const [status, setStatus] = useState<PluginStatus | null>(null);
    const [connection, setConnection] = useState<ConnectionStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [testing, setTesting] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const next = await getStatus();
                if (!cancelled) {
                    setStatus(next);
                }
            } catch (e) {
                if (!cancelled) {
                    setMessage((e as Error).message);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    async function onTest() {
        setTesting(true);
        setMessage('');
        try {
            setConnection(await testConnection());
        } catch (e) {
            setMessage((e as Error).message);
        } finally {
            setTesting(false);
        }
    }

    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: 12, padding: 16}}>
            <strong>{'Mattermost LLM status'}</strong>
            {loading && <span>{'Loading plugin status...'}</span>}
            {status && (
                <>
                    <div>{`Base URL: ${status.base_url || 'not configured'}`}</div>
                    <div>{`Bots: ${status.bot_count}`}</div>
                    <div>{`Allowed hosts: ${(status.allow_hosts || []).join(', ') || 'using the base URL host'}`}</div>
                    {status.config_error && <div>{`Configuration error: ${status.config_error}`}</div>}
                    {status.bot_sync?.last_error && <div>{`Bot sync error: ${status.bot_sync.last_error}`}</div>}
                </>
            )}
            <button className='btn btn-primary' type='button' disabled={testing} onClick={onTest}>
                {testing ? 'Testing connection...' : 'Test connection'}
            </button>
            {connection && (
                <div>
                    <div>{connection.ok ? 'Connection succeeded.' : 'Connection failed.'}</div>
                    <div>{connection.url}</div>
                    <div style={{whiteSpace: 'pre-wrap'}}>{connection.message}</div>
                </div>
            )}
            {message && <span>{message}</span>}
        </div>
    );
}
