import React, {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';

type Props = {children: React.ReactNode; onClose: () => void};

// A body portal avoids the containing block created by Mattermost's scrolling posts.
export default function DialogPortal({children, onClose}: Props) {
    const container = useRef<HTMLDivElement>(null);
    const close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const dialog = container.current?.querySelector<HTMLElement>('[role="dialog"]');
        if (!dialog) {
            return undefined;
        }
        const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'));
        dialog.tabIndex = -1;
        (focusable()[0] || dialog).focus({preventScroll: true});
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close.current();
            } else if (event.key === 'Tab') {
                const elements = focusable();
                const first = elements[0] || dialog;
                const last = elements[elements.length - 1] || dialog;
                if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };
        dialog.addEventListener('keydown', onKeyDown);
        return () => {
            dialog.removeEventListener('keydown', onKeyDown);
            if (previous?.isConnected) {
                previous.focus({preventScroll: true});
            }
        };
    }, []);
    return createPortal(<div className='doc2vllm-markdown-body' ref={container}>{children}</div>, document.body);
}
