/** @jest-environment jsdom */
import React from 'react';
import {createRoot} from 'react-dom/client';
import {act} from 'react-dom/test-utils';
import MermaidDiagram from './mermaid_diagram';

jest.mock('../mermaid_rendering', () => ({detectDiagramType: () => 'flowchart', renderMermaidDefinition: jest.fn().mockResolvedValue({svg: '<svg></svg>'})}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

test('diagram popup escapes the scrolled post and restores keyboard focus', async () => {
    const post = document.createElement('div');
    post.style.transform = 'translateY(1000px)';
    post.style.overflow = 'hidden';
    document.body.appendChild(post);
    const root = createRoot(post);
    try {
        await act(async () => root.render(<MermaidDiagram definition='graph TD; A-->B' postID='post' index={0}/>));
        const open = Array.from(post.querySelectorAll('button')).find((b) => b.textContent === '확대')!;
        open.focus();
        await act(async () => open.click());
        const dialog = document.querySelector('[role="dialog"]')!;
        expect(dialog).not.toBeNull();
        expect(post.contains(dialog)).toBe(false);
        expect(dialog.contains(document.activeElement)).toBe(true);
        const plus = dialog.querySelector<HTMLButtonElement>('button[aria-label="확대"]')!;
        await act(async () => plus.click());
        expect(dialog.querySelector<HTMLElement>('[data-testid="doc2vllm-mermaid-diagram-popup"]')?.style.width).toBe('125%');
        const fit = dialog.querySelector<HTMLButtonElement>('button[aria-label="화면에 맞추기"]')!;
        await act(async () => fit.click());
        expect(dialog.querySelector<HTMLElement>('[data-testid="doc2vllm-mermaid-diagram-popup"]')?.style.width).toBe('100%');
        expect(dialog.querySelector<HTMLElement>('[data-testid="doc2vllm-mermaid-diagram-popup"]')?.getAttribute('style')).toContain('height:');
        const buttons = dialog.querySelectorAll<HTMLButtonElement>('button');
        buttons[buttons.length - 1].focus();
        await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true})));
        expect(document.activeElement).toBe(buttons[0]);
        await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement).toBe(open);
    } finally {
        act(() => root.unmount());
        post.remove();
    }
});
