import React, {useEffect, useMemo, useState} from 'react';
import {useSelector} from 'react-redux';

import type {GlobalState} from '@mattermost/types/store';

import type {BotDefinition, BotRunResult, ExecutionRecord} from '../client';
import {getBots, getHistory, runBot} from '../client';

const muted = 'rgba(var(--center-channel-color-rgb),.64)';
const section: React.CSSProperties = {display: 'flex', flexDirection: 'column', gap: 10};
const card: React.CSSProperties = {border: '1px solid rgba(var(--center-channel-color-rgb),.12)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13};
const field: React.CSSProperties = {width: '100%', background: 'var(--center-channel-bg)', color: 'inherit', border: '1px solid rgba(var(--center-channel-color-rgb),.16)', borderRadius: 8, padding: '10px 12px', fontSize: 14};
const chip: React.CSSProperties = {background: 'rgba(var(--button-bg-rgb),.08)', border: 0, borderRadius: 999, color: 'rgb(var(--button-bg-rgb))', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 10px'};
const label: React.CSSProperties = {color: muted, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase'};
const suggestions = ['이 내용을 다이어그램으로 정리해줘', '핵심만 5줄로 요약해줘', '장단점을 표로 비교해줘', '이 문서의 처리 흐름을 순서도로 그려줘'];

function StatusDot({status}: {status: string}) {
    const ok = (/success|ok|completed/i).test(status);
    return <span style={{background: ok ? 'var(--online-indicator)' : 'var(--dnd-indicator)', borderRadius: 999, display: 'inline-block', height: 8, marginRight: 6, width: 8}}/>;
}

export default function RHSPane() {
    const channelId = useSelector((state: GlobalState) => state.entities.channels.currentChannelId);
    const selectedPostId = useSelector((state: GlobalState) => (state as any).views?.rhs?.selectedPostId as string | undefined);
    const post = useSelector((state: GlobalState) => (selectedPostId ? ((state as any).entities?.posts?.posts || {})[selectedPostId] : null)) as any;
    const files = useSelector((state: GlobalState) => ((state as any).entities?.files?.files || {})) as Record<string, any>;

    const [bots, setBots] = useState<BotDefinition[]>([]);
    const [history, setHistory] = useState<ExecutionRecord[]>([]);
    const [selectedBotId, setSelectedBotId] = useState('');
    const [prompt, setPrompt] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [lastResult, setLastResult] = useState<BotRunResult | null>(null);

    const bot = useMemo(() => bots.find((item) => item.id === selectedBotId) || bots[0] || null, [bots, selectedBotId]);
    const fileIds = Array.isArray(post?.file_ids) ? post.file_ids.filter(Boolean) : [];
    const fileNames = fileIds.map((id: string) => files[id]?.name || id);
    const rootId = post?.root_id || post?.id || selectedPostId;

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setMessage('');
            try {
                const [nextBots, nextHistory] = await Promise.all([getBots(channelId), getHistory(5)]);
                if (cancelled) {
                    return;
                }
                setBots(nextBots);
                setHistory(nextHistory);
                setSelectedBotId((current) => (current && nextBots.some((item) => item.id === current) ? current : (nextBots[0]?.id || '')));
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
    }, [channelId]);

    async function submit() {
        if (!bot || !channelId || (!prompt.trim() && fileIds.length === 0)) {
            return;
        }
        setSubmitting(true);
        setMessage('');
        try {
            const result = await runBot({bot_id: bot.id, channel_id: channelId, root_id: rootId, prompt, file_ids: fileIds});
            setLastResult(result);
            setPrompt('');
            setHistory(await getHistory(5));
            setMessage(`@${bot.username} \ubd07\uc774 Mattermost \uc2a4\ub808\ub4dc\uc5d0 \uc751\ub2f5\uc744 \uac8c\uc2dc\ud588\uc2b5\ub2c8\ub2e4.`);
        } catch (e) {
            setMessage((e as Error).message);
        } finally {
            setSubmitting(false);
        }
    }

    const canSubmit = !submitting && Boolean(bot) && Boolean(channelId) && (prompt.trim() !== '' || fileIds.length > 0);

    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: 20, padding: 16}}>
            <section style={section}>
                <div>
                    <div style={{fontSize: 16, fontWeight: 700}}>{'무엇을 도와드릴까요?'}</div>
                    <div style={{color: muted, fontSize: 12, marginTop: 2}}>{'텍스트만 보내도 되고, 포스트를 선택해 첨부 파일과 함께 분석할 수도 있습니다.'}</div>
                </div>
                {loading && <span style={{color: muted}}>{'봇 목록을 불러오는 중입니다...'}</span>}
                {!loading && bots.length === 0 && <span style={{color: muted}}>{'현재 채널에서 사용할 수 있는 봇이 없습니다.'}</span>}
                {!loading && bots.length > 0 && (
                    <>
                        <select
                            style={field}
                            value={bot?.id || ''}
                            onChange={(e) => setSelectedBotId(e.target.value)}
                        >
                            {bots.map((item) => (
                                <option
                                    key={item.id}
                                    value={item.id}
                                >
                                    {`${item.display_name || item.username} (@${item.username})`}
                                </option>
                            ))}
                        </select>
                        {fileNames.length > 0 && <div style={{...card, padding: '8px 12px'}}><span style={label}>{'첨부 파일'}</span><span>{fileNames.join(', ')}</span></div>}
                        <textarea
                            style={{...field, resize: 'vertical', minHeight: 110}}
                            rows={5}
                            value={prompt}
                            placeholder={'질문을 입력하세요 (Ctrl+Enter로 전송)'}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSubmit) {
                                    e.preventDefault();
                                    submit();
                                }
                            }}
                        />
                        <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
                            {suggestions.map((item) => (
                                <button
                                    key={item}
                                    style={chip}
                                    type='button'
                                    onClick={() => setPrompt(item)}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                        <button
                            className='btn btn-primary'
                            type='button'
                            disabled={!canSubmit}
                            onClick={submit}
                        >{submitting ? '요청 중...' : `@${bot?.username || 'bot'}에게 보내기`}</button>
                    </>
                )}
                {message && <span style={{color: muted, fontSize: 12}}>{message}</span>}
            </section>

            {lastResult && (
                <section style={section}>
                    <span style={label}>{'최근 실행 결과'}</span>
                    <div style={card}>
                        <div style={{fontWeight: 600}}><StatusDot status={lastResult.status}/>{lastResult.bot_name || lastResult.bot_username}</div>
                        <div style={{color: muted, fontSize: 12}}>{[lastResult.model, typeof lastResult.api_duration_ms === 'number' && lastResult.api_duration_ms > 0 ? `${(lastResult.api_duration_ms / 1000).toFixed(2)}s` : ''].filter(Boolean).join(' · ')}</div>
                        {lastResult.output && <div style={{whiteSpace: 'pre-wrap'}}>{cut(lastResult.output, 400)}</div>}
                        {lastResult.error_message && <div style={{color: 'var(--dnd-indicator)', whiteSpace: 'pre-wrap'}}>{lastResult.error_message}</div>}
                    </div>
                </section>
            )}

            <section style={section}>
                <span style={label}>{'최근 기록'}</span>
                {history.length === 0 && <span style={{color: muted, fontSize: 12}}>{'아직 실행 기록이 없습니다.'}</span>}
                {history.map((item) => (
                    <div
                        key={item.correlation_id}
                        style={card}
                    >
                        <div style={{fontWeight: 600}}><StatusDot status={item.status}/>{item.bot_name || item.bot_username}</div>
                        <div style={{color: muted, fontSize: 12}}>{`${item.model} · ${item.source}`}</div>
                        {item.error_message && <div style={{color: 'var(--dnd-indicator)', fontSize: 12, whiteSpace: 'pre-wrap'}}>{item.error_message}</div>}
                    </div>
                ))}
            </section>
        </div>
    );
}

function cut(value: string, max: number) {
    const next = (value || '').trim();
    return next.length <= max ? next : `${next.slice(0, max - 1)}...`;
}
