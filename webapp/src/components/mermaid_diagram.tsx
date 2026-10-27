import React, {useEffect, useRef, useState} from 'react';

import DialogPortal from './dialog_portal';

import {detectDiagramType, renderMermaidDefinition} from '../mermaid_rendering';

type Props = {
    definition: string;
    postID: string;
    index: number;
};

export default function MermaidDiagram({definition, postID, index}: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const popupContainerRef = useRef<HTMLDivElement | null>(null);
    const copyResetTimerRef = useRef<number | null>(null);
    const [error, setError] = useState('');
    const [popupError, setPopupError] = useState('');
    const [zoom, setZoom] = useState(100);
    const [copied, setCopied] = useState(false);
    const [showSource, setShowSource] = useState(false);
    const [showRenderedPopup, setShowRenderedPopup] = useState(false);
    const diagramType = detectDiagramType(definition);

    useEffect(() => {
        if (showSource) {
            return () => undefined;
        }
        return renderIntoContainer({
            containerRef,
            definition,
            postID,
            index,
            setError,
            variant: 'inline',
        });
    }, [definition, index, postID, showSource]);

    useEffect(() => {
        if (!showRenderedPopup) {
            setPopupError('');
            return () => undefined;
        }

        const cleanupRender = renderIntoContainer({
            containerRef: popupContainerRef,
            definition,
            postID,
            index,
            setError: setPopupError,
            variant: 'popup',
        });
        return () => {
            cleanupRender();
        };
    }, [definition, index, postID, showRenderedPopup]);

    useEffect(() => {
        return () => {
            if (copyResetTimerRef.current) {
                window.clearTimeout(copyResetTimerRef.current);
            }
        };
    }, []);

    const handleCopy = async () => {
        const copySucceeded = await copyText(definition);
        if (!copySucceeded) {
            setError((currentError) => currentError || '원문 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.');
            return;
        }

        setCopied(true);
        if (copyResetTimerRef.current) {
            window.clearTimeout(copyResetTimerRef.current);
        }
        copyResetTimerRef.current = window.setTimeout(() => {
            setCopied(false);
        }, 1600);
    };

    const handleDownload = () => {
        const svg = containerRef.current?.querySelector('svg');
        if (!svg) {
            return;
        }
        const url = URL.createObjectURL(new Blob([svg.outerHTML], {type: 'image/svg+xml'}));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${diagramType}-${postID.slice(0, 8)}-${index}.svg`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const sourceBlock = (
        <pre className='post-code doc2vllm-mermaid-source'>
            <code className='language-mermaid'>{definition}</code>
        </pre>
    );

    return (
        <>
            <div className='doc2vllm-mermaid-card'>
                <div className='doc2vllm-mermaid-toolbar'>
                    <span className='doc2vllm-mermaid-type'>{diagramType}</span>
                    <button
                        className='doc2vllm-mermaid-toolbar-button'
                        onClick={() => setShowSource((value) => !value)}
                        type='button'
                    >
                        {showSource ? '다이어그램' : '코드'}
                    </button>
                    <button
                        className='doc2vllm-mermaid-toolbar-button'
                        onClick={handleCopy}
                        type='button'
                    >
                        {copied ? '복사됨' : '복사'}
                    </button>
                    {!showSource && !error && (
                        <>
                            <button
                                className='doc2vllm-mermaid-toolbar-button'
                                onClick={handleDownload}
                                type='button'
                            >
                                {'SVG'}
                            </button>
                            <button
                                className='doc2vllm-mermaid-toolbar-button'
                                onClick={() => { setZoom(100); setShowRenderedPopup(true); }}
                                type='button'
                            >
                                {'확대'}
                            </button>
                        </>
                    )}
                </div>
                {error && !showSource && (
                    <div className='doc2vllm-mermaid-error'>
                        {`다이어그램을 그리지 못해 코드로 표시합니다: ${error}`}
                    </div>
                )}
                {showSource || error ? sourceBlock : (
                    <div className='doc2vllm-mermaid-rendered'>
                        <div
                            data-testid='doc2vllm-mermaid-diagram'
                            ref={containerRef}
                        />
                    </div>
                )}
            </div>
            {showRenderedPopup && (
                <DialogPortal onClose={() => setShowRenderedPopup(false)}>
                <div
                    className='doc2vllm-mermaid-modal-backdrop'
                    onClick={() => setShowRenderedPopup(false)}
                    role='presentation'
                >
                    <div
                        aria-modal='true'
                        aria-label={`${diagramType} 다이어그램 확대`}
                        className='doc2vllm-mermaid-modal doc2vllm-mermaid-render-modal'
                        onClick={(event) => event.stopPropagation()}
                        role='dialog'
                    >
                        <div className='doc2vllm-mermaid-modal-header'>
                            <strong>{diagramType}</strong>
                            <div className='doc2vllm-mermaid-modal-actions'>
                                <button className='doc2vllm-mermaid-toolbar-button' aria-label='축소' disabled={zoom <= 50} onClick={() => setZoom((value) => Math.max(50, value - 25))} type='button'>{'−'}</button>
                                <button className='doc2vllm-mermaid-toolbar-button' aria-label='화면에 맞추기' onClick={() => setZoom(100)} type='button'>{`${zoom}%`}</button>
                                <button className='doc2vllm-mermaid-toolbar-button' aria-label='확대' disabled={zoom >= 300} onClick={() => setZoom((value) => Math.min(300, value + 25))} type='button'>{'+'}</button>
                                <button
                                    className='doc2vllm-mermaid-toolbar-button'
                                    onClick={handleCopy}
                                    type='button'
                                >
                                    {copied ? '복사됨' : '복사'}
                                </button>
                                <button
                                    className='doc2vllm-mermaid-toolbar-button'
                                    onClick={() => setShowRenderedPopup(false)}
                                    type='button'
                                >
                                    {'닫기'}
                                </button>
                            </div>
                        </div>
                        {popupError && (
                            <div className='doc2vllm-mermaid-error doc2vllm-mermaid-modal-error'>
                                {`Mermaid 렌더링 실패: ${popupError}`}
                            </div>
                        )}
                        <div className='doc2vllm-mermaid-modal-content'>
                            {popupError ? sourceBlock : (
                                <div
                                    className='doc2vllm-mermaid-rendered doc2vllm-mermaid-rendered-popup'
                                    data-testid='doc2vllm-mermaid-diagram-popup'
                                    ref={popupContainerRef}
                                    style={{width: `${zoom}%`, height: `calc(${80 * zoom / 100}vh - ${110 * zoom / 100}px)`, maxHeight: `${610 * zoom / 100}px`}}
                                />
                            )}
                        </div>
                    </div>
                </div>
                </DialogPortal>
            )}
        </>
    );
}

async function copyText(value: string) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch {
        return legacyCopy(value);
    }

    return legacyCopy(value);
}

function legacyCopy(value: string) {
    if (typeof document === 'undefined') {
        return false;
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'true');
    textarea.style.opacity = '0';
    textarea.style.position = 'fixed';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();

    try {
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        document.body.removeChild(textarea);
    }
}

type RenderIntoContainerOptions = {
    containerRef: React.RefObject<HTMLDivElement>;
    definition: string;
    postID: string;
    index: number;
    setError: React.Dispatch<React.SetStateAction<string>>;
    variant: string;
};

function renderIntoContainer({
    containerRef,
    definition,
    postID,
    index,
    setError,
    variant,
}: RenderIntoContainerOptions) {
    const container = containerRef.current;
    if (!container) {
        return () => undefined;
    }

    let cancelled = false;
    container.innerHTML = '';
    setError('');

    renderMermaidDefinition(definition, postID, index, variant).then(({svg, bindFunctions}) => {
        if (cancelled || !containerRef.current) {
            return;
        }
        containerRef.current.innerHTML = svg;
        bindFunctions?.(containerRef.current);
    }).catch((renderError: unknown) => {
        if (cancelled) {
            return;
        }
        const message = renderError instanceof Error ? renderError.message : String(renderError);
        setError(message);
    });

    return () => {
        cancelled = true;
        if (containerRef.current) {
            containerRef.current.innerHTML = '';
        }
    };
}

