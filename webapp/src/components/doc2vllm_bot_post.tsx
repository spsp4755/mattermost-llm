import React, {useEffect, useMemo, useRef, useState} from 'react';

import type {WebSocketMessage} from '@mattermost/client';

import PostText from './post_text';
import DialogPortal from './dialog_portal';

import {splitResponseParts} from '../response_parts';
import {isDoc2VLLMAwaitingFirstChunk} from '../streaming';

type PostUpdateData = {
    post_id?: string;
    next?: string;
    control?: string;
};

type Props = {
    post: any;
    websocketRegister: (postID: string, listenerID: string, listener: (msg: WebSocketMessage<PostUpdateData>) => void) => void;
    websocketUnregister: (postID: string, listenerID: string) => void;
};

const containerStyle: React.CSSProperties = {display: 'flex', flexDirection: 'column', gap: '8px'};
const statusStyle: React.CSSProperties = {color: 'rgba(var(--center-channel-color-rgb), 0.72)', fontSize: '12px', fontWeight: 600, letterSpacing: '0.01em'};
const precontentStyle: React.CSSProperties = {alignItems: 'center', color: 'rgba(var(--center-channel-color-rgb), 0.72)', display: 'inline-flex', fontSize: '13px', gap: '8px'};
const spinnerStyle: React.CSSProperties = {animation: 'doc2vllm-stream-cursor-blink 700ms linear infinite', background: 'rgba(var(--center-channel-color-rgb), 0.16)', borderRadius: '999px', display: 'inline-block', height: '10px', width: '10px'};
const footerStyle: React.CSSProperties = {alignItems: 'center', color: 'rgba(var(--center-channel-color-rgb), 0.56)', display: 'flex', flexWrap: 'wrap', fontSize: '12px', gap: '4px 12px'};
const buttonStyle: React.CSSProperties = {background: 'transparent', border: '1px solid rgba(var(--center-channel-color-rgb), 0.16)', borderRadius: '6px', color: 'rgba(var(--center-channel-color-rgb), 0.72)', cursor: 'pointer', fontSize: '12px', fontWeight: 600, padding: '2px 8px'};
const modalBackdropStyle: React.CSSProperties = {alignItems: 'center', background: 'rgba(0, 0, 0, 0.44)', bottom: 0, display: 'flex', justifyContent: 'center', left: 0, padding: '24px', position: 'fixed', right: 0, top: 0, zIndex: 2147483000};
const modalCardStyle: React.CSSProperties = {background: 'var(--center-channel-bg)', border: '1px solid rgba(var(--center-channel-color-rgb), 0.12)', borderRadius: '12px', boxShadow: '0 16px 48px rgba(0, 0, 0, 0.24)', color: 'rgb(var(--center-channel-color-rgb))', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 48px)', overflow: 'hidden', width: 'min(960px, calc(100vw - 32px))'};
const modalHeaderStyle: React.CSSProperties = {alignItems: 'center', borderBottom: '1px solid rgba(var(--center-channel-color-rgb), 0.12)', display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '16px 20px'};
const modalBodyStyle: React.CSSProperties = {display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', overflowY: 'auto', padding: '20px'};
const debugPanelStyle: React.CSSProperties = {background: 'rgba(var(--center-channel-color-rgb), 0.04)', border: '1px solid rgba(var(--center-channel-color-rgb), 0.08)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0, padding: '16px'};
const debugPreStyle: React.CSSProperties = {background: 'rgba(var(--center-channel-color-rgb), 0.04)', borderRadius: '8px', fontSize: '12px', margin: 0, maxHeight: '52vh', minHeight: '160px', overflow: 'auto', padding: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word'};

export default function Doc2VLLMBotPost(props: Props) {
    const [message, setMessage] = useState(getRenderableMessage(props.post));
    const [generating, setGenerating] = useState(isStreamingPost(props.post));
    const [precontent, setPrecontent] = useState(isDoc2VLLMAwaitingFirstChunk(props.post));
    const [showDebugModal, setShowDebugModal] = useState(false);
    const listenerID = useRef(`doc2vllm-${Math.random().toString(36).slice(2)}`);
    const inputDebug = normalizeDebugPayload(props.post?.props?.doc2vllm_request_input || props.post?.props?.doc2vllm_error_input);
    const outputDebug = normalizeDebugPayload(props.post?.props?.doc2vllm_response_output || props.post?.props?.doc2vllm_error_output);
    const canShowDebug = inputDebug !== '' || outputDebug !== '';
    const parts = useMemo(() => splitResponseParts(message), [message]);
    const model = props.post?.props?.doc2vllm_model || '';
    const debugModalTitle = outputDebug !== '' ? 'LLM request and response details' : 'LLM request details';

    useEffect(() => {
        setMessage(getRenderableMessage(props.post));
        setGenerating(isStreamingPost(props.post));
        setPrecontent(isDoc2VLLMAwaitingFirstChunk(props.post));
        setShowDebugModal(false);
    }, [props.post.id, props.post.message, props.post.props?.doc2vllm_streaming, props.post.props?.doc2vllm_stream_status, props.post.props?.doc2vllm_stream_placeholder, props.post.props?.doc2vllm_request_input, props.post.props?.doc2vllm_response_output, props.post.props?.doc2vllm_error_input, props.post.props?.doc2vllm_error_output]);

    const listener = useMemo(() => ((msg: WebSocketMessage<PostUpdateData>) => {
        const data = msg?.data || {};
        if (data.post_id !== props.post.id) {
            return;
        }
        if (data.control === 'start') {
            setGenerating(true);
            setPrecontent(true);
            setMessage('');
            return;
        }
        if (typeof data.next === 'string' && data.next !== '') {
            setGenerating(true);
            setPrecontent(false);
            setMessage(data.next);
            return;
        }
        if (data.control === 'end' || data.control === 'cancel') {
            setGenerating(false);
            setPrecontent(false);
        }
    }), [props.post.id]);

    useEffect(() => {
        props.websocketRegister(props.post.id, listenerID.current, listener);
        return () => props.websocketUnregister(props.post.id, listenerID.current);
    }, [listener, props.post.id, props.websocketRegister, props.websocketUnregister]);

    return (
        <div
            data-testid='doc2vllm-bot-post'
            style={containerStyle}
        >
            {precontent && <span style={precontentStyle}><span style={spinnerStyle}/>{'응답을 준비하고 있습니다...'}</span>}
            <PostText
                channelID={props.post.channel_id}
                message={parts.body}
                postID={props.post.id}
                showCursor={generating && !precontent}
            />
            {parts.reasoning && props.post?.props?.doc2vllm_show_reasoning === true && (
                <details className='doc2vllm-reasoning'>
                    <summary>{'생각 과정 보기'}</summary>
                    <PostText
                        channelID={props.post.channel_id}
                        message={parts.reasoning}
                        postID={`${props.post.id}-reasoning`}
                    />
                </details>
            )}
            {generating && !precontent && <span style={statusStyle}>{'응답 생성 중...'}</span>}
            {!generating && (parts.correlationID || canShowDebug) && (
                <div
                    data-testid='doc2vllm-post-footer'
                    style={footerStyle}
                >
                    {model && <span>{model}</span>}
                    {parts.duration && <span>{parts.duration}</span>}
                    {parts.correlationID && <span title={'Correlation ID'}>{`ID ${parts.correlationID}`}</span>}
                    {canShowDebug && (
                        <button
                            style={buttonStyle}
                            type='button'
                            onClick={() => setShowDebugModal(true)}
                        >
                            {'상세'}
                        </button>
                    )}
                </div>
            )}
            {showDebugModal && canShowDebug && (
                <DialogPortal onClose={() => setShowDebugModal(false)}>
                <div
                    aria-modal='true'
                    aria-label={debugModalTitle}
                    role='dialog'
                    style={modalBackdropStyle}
                    onClick={() => setShowDebugModal(false)}
                >
                    <div
                        style={modalCardStyle}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div style={modalHeaderStyle}>
                            <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                                <strong>{debugModalTitle}</strong>
                                <span style={statusStyle}>{`Correlation ID: ${props.post?.props?.doc2vllm_correlation_id || '-'}`}</span>
                            </div>
                            <button
                                style={buttonStyle}
                                type='button'
                                onClick={() => setShowDebugModal(false)}
                            >{'Close'}</button>
                        </div>
                        <div style={modalBodyStyle}>
                            <section style={debugPanelStyle}>
                                <strong>{'Request details'}</strong>
                                <pre style={debugPreStyle}>{inputDebug || '{}'}</pre>
                            </section>
                            {outputDebug !== '' && <section style={debugPanelStyle}><strong>{'Response details'}</strong><pre style={debugPreStyle}>{outputDebug}</pre></section>}
                        </div>
                    </div>
                </div>
                </DialogPortal>
            )}
        </div>
    );
}

function isStreamingPost(post: any) {
    return post?.props?.doc2vllm_streaming === 'true' || post?.props?.doc2vllm_stream_status === 'streaming';
}

function getRenderableMessage(post: any) {
    if (isDoc2VLLMAwaitingFirstChunk(post)) {
        return '';
    }
    return post?.message || '';
}

function normalizeDebugPayload(value: unknown) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
}
