import mermaid from 'mermaid/dist/mermaid.esm.min.mjs';

type MermaidModule = typeof mermaid;

export type RenderableMessageSegment = {
    kind: 'text' | 'mermaid';
    content: string;
};

const mermaidFencePattern = /```mermaid[\t ]*\n([\s\S]*?)\n```/gi;
let initializedThemeKey = '';

export function containsCompleteMermaidFence(message: string) {
    return (/```mermaid[\t ]*\n[\s\S]*?\n```/i).test(normalizeRenderableMessage(message));
}

export function normalizeRenderableMessage(message: string) {
    const withNormalizedTables = transformOutsideFencedCodeBlocks(
        (message || '').replace(/\r\n/g, '\n'),
        normalizeEmbeddedHtmlTables,
    );
    const normalizedLines = normalizeMarkdownTableLines(
        normalizeFencedCodeBlockLines(
            normalizeMermaidLines(withNormalizedTables).split('\n'),
        ),
    );
    return normalizedLines.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function splitRenderableMessage(message: string): RenderableMessageSegment[] {
    const segments: RenderableMessageSegment[] = [];
    const text = normalizeRenderableMessage(message);
    const matcher = new RegExp(mermaidFencePattern);

    let lastIndex = 0;
    let match = matcher.exec(text);
    while (match) {
        const fullMatch = match[0];
        const definition = (match[1] || '').trim();
        const matchIndex = match.index;

        if (matchIndex > lastIndex) {
            segments.push({
                kind: 'text',
                content: text.slice(lastIndex, matchIndex),
            });
        }

        if (definition) {
            segments.push({
                kind: 'mermaid',
                content: definition,
            });
        } else {
            segments.push({
                kind: 'text',
                content: fullMatch,
            });
        }

        lastIndex = matchIndex + fullMatch.length;
        match = matcher.exec(text);
    }

    if (lastIndex < text.length) {
        segments.push({
            kind: 'text',
            content: text.slice(lastIndex),
        });
    }

    if (segments.length === 0) {
        return [{kind: 'text', content: text}];
    }

    return segments.filter((segment, index) => (
        segment.kind === 'mermaid' ||
        segment.content !== '' ||
        index === segments.length - 1
    ));
}

export async function renderMermaidDefinition(definition: string, postID: string, index: number, variant = 'inline') {
    const mermaid = getMermaidModule();
    const themeKey = readThemeColors().join(',');
    if (themeKey !== initializedThemeKey) {
        mermaid.initialize(buildMermaidConfig());
        initializedThemeKey = themeKey;
    }
    return mermaid.render(buildDiagramID(postID, index, variant), definition);
}

export function detectDiagramType(definition: string) {
    const firstLine = definition.split('\n').map((line) => line.trim()).find((line) => line && !line.startsWith('%%')) || '';
    return firstLine.split(/[\s-]/)[0] || 'diagram';
}

// Mattermost exposes its theme as CSS variables; mermaid needs concrete colors, so we read them once per theme.
function readThemeColors() {
    if (typeof document === 'undefined') {
        return ['#ffffff', '#3f4350', '#1c58d9'];
    }
    const style = getComputedStyle(document.body);
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    return [read('--center-channel-bg', '#ffffff'), read('--center-channel-color', '#3f4350'), read('--button-bg', '#1c58d9')];
}

export function buildMermaidConfig() {
    const [bg, fg, accent] = readThemeColors();
    const parsed = [bg, fg, accent].map(parseHexColor);

    // Mermaid 12 defaults to the shadowed "neo" look and ELK layout; classic + dagre stay legible inside chat posts.
    // suppressErrorRendering stops mermaid from leaving its "Syntax error" bomb in document.body; we show the code instead.
    const base = {startOnLoad: false, securityLevel: 'strict' as const, fontFamily: 'Arial, Noto Sans KR, sans-serif', look: 'classic' as const, layout: 'dagre', suppressErrorRendering: true};
    if (parsed.some((color) => !color)) {
        return {...base, theme: 'neutral' as const};
    }
    const [bgRGB, fgRGB, accentRGB] = parsed as RGB[];
    const darkMode = luminance(bgRGB) < 0.5;
    const chartColors = chartPalette(accentRGB).map((color) => mixHex(color, bgRGB, darkMode ? 0.75 : 0.85));
    return {
        ...base,
        theme: 'base' as const,
        themeVariables: {
            darkMode,
            background: bg,
            fontFamily: 'Arial, Noto Sans KR, sans-serif',
            fontSize: '15px',
            primaryColor: mixHex(accentRGB, bgRGB, 0.14),
            primaryBorderColor: mixHex(accentRGB, bgRGB, 0.6),
            primaryTextColor: fg,
            secondaryColor: mixHex(fgRGB, bgRGB, 0.06),
            secondaryBorderColor: mixHex(fgRGB, bgRGB, 0.3),
            secondaryTextColor: fg,
            tertiaryColor: mixHex(fgRGB, bgRGB, 0.03),
            tertiaryBorderColor: mixHex(fgRGB, bgRGB, 0.2),
            tertiaryTextColor: fg,
            lineColor: mixHex(fgRGB, bgRGB, 0.55),
            textColor: fg,
            mainBkg: mixHex(accentRGB, bgRGB, 0.14),
            nodeBorder: mixHex(accentRGB, bgRGB, 0.6),
            clusterBkg: mixHex(fgRGB, bgRGB, 0.04),
            clusterBorder: mixHex(fgRGB, bgRGB, 0.2),
            edgeLabelBackground: bg,
            noteBkgColor: mixHex(accentRGB, bgRGB, 0.08),
            noteTextColor: fg,
            noteBorderColor: mixHex(accentRGB, bgRGB, 0.4),
            ...Object.fromEntries(chartColors.map((color, i) => [`pie${i + 1}`, color])),

            // Mindmap and timeline sections.
            ...Object.fromEntries(chartColors.map((color, i) => [`cScale${i}`, color])),
            ...Object.fromEntries(chartColors.map((_, i) => [`cScaleLabel${i}`, '#ffffff'])),
            xyChart: {plotColorPalette: chartColors.join(','), backgroundColor: bg, titleColor: fg, xAxisLabelColor: fg, yAxisLabelColor: fg, xAxisTitleColor: fg, yAxisTitleColor: fg, xAxisLineColor: mixHex(fgRGB, bgRGB, 0.4), yAxisLineColor: mixHex(fgRGB, bgRGB, 0.4), xAxisTickColor: mixHex(fgRGB, bgRGB, 0.4), yAxisTickColor: mixHex(fgRGB, bgRGB, 0.4)},
            pieStrokeColor: bg,
            pieOuterStrokeColor: mixHex(fgRGB, bgRGB, 0.2),
            pieOpacity: '1',
            pieSectionTextColor: '#ffffff',
            pieTitleTextColor: fg,
            pieLegendTextColor: fg,
        },
        flowchart: {curve: 'basis' as const, padding: 20, nodeSpacing: 36, rankSpacing: 48, htmlLabels: false},
        sequence: {mirrorActors: false, useMaxWidth: true, wrap: true, actorMargin: 40, messageMargin: 36},
    };
}

type RGB = [number, number, number];

// Categorical colors for pie/chart slices, led by the theme accent.
function chartPalette(accent: RGB): RGB[] {
    return [accent, [20, 184, 166], [245, 158, 11], [139, 92, 246], [239, 68, 68], [100, 116, 139]];
}

function parseHexColor(value: string): RGB | null {
    const match = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!match) {
        return null;
    }
    const hex = match[1].length === 3 ? match[1].split('').map((c) => c + c).join('') : match[1];
    return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as RGB;
}

function mixHex(top: RGB, bottom: RGB, weight: number) {
    return '#' + top.map((channel, i) => Math.round((channel * weight) + (bottom[i] * (1 - weight))).toString(16).padStart(2, '0')).join('');
}

function luminance([r, g, b]: RGB) {
    return ((0.299 * r) + (0.587 * g) + (0.114 * b)) / 255;
}

function getMermaidModule() {
    return mermaid as MermaidModule;
}

function buildDiagramID(postID: string, index: number, variant: string) {
    const normalized = postID.replace(/[^a-zA-Z0-9_-]/g, '');
    const normalizedVariant = variant.replace(/[^a-zA-Z0-9_-]/g, '');
    return `doc2vllm-mermaid-${normalized}-${index}-${normalizedVariant}-${Date.now()}`;
}

function normalizeMermaidLines(linesText: string) {
    const lines = linesText.split('\n');
    const normalized: string[] = [];
    let inMermaidBlock = false;
    let mermaidIndent = '';

    for (const line of lines) {
        if (!inMermaidBlock) {
            const openingMatch = line.match(/^(\s*)```mermaid\b(.*)$/i);
            if (openingMatch) {
                inMermaidBlock = true;
                mermaidIndent = openingMatch[1] || '';
                normalized.push(`\`\`\`mermaid${openingMatch[2] || ''}`.trimEnd());
                continue;
            }
            normalized.push(line);
            continue;
        }

        if ((/^\s*```/).test(line)) {
            inMermaidBlock = false;
            mermaidIndent = '';
            normalized.push('```');
            continue;
        }

        if (mermaidIndent && line.startsWith(mermaidIndent)) {
            normalized.push(line.slice(mermaidIndent.length));
            continue;
        }

        normalized.push(line.replace(/^\s{1,4}/, ''));
    }

    return normalized.join('\n');
}

function transformOutsideFencedCodeBlocks(message: string, transform: (value: string) => string) {
    const lines = message.split('\n');
    const segments: string[] = [];
    const buffer: string[] = [];
    let inFence = false;
    let fenceMarker = '';

    const flushBuffer = () => {
        if (buffer.length === 0) {
            return;
        }

        segments.push(transform(buffer.join('\n')));
        buffer.length = 0;
    };

    for (const line of lines) {
        if (!inFence) {
            const openingFence = matchFenceOpening(line);
            if (openingFence) {
                flushBuffer();
                inFence = true;
                fenceMarker = openingFence;
                segments.push(line);
                continue;
            }

            buffer.push(line);
            continue;
        }

        segments.push(line);
        if (isFenceClosing(line, fenceMarker)) {
            inFence = false;
            fenceMarker = '';
        }
    }

    flushBuffer();
    return segments.join('\n');
}

function normalizeEmbeddedHtmlTables(message: string) {
    return message.replace(/<table[\s\S]*?<\/table>/gi, (match) => convertHtmlTableToMarkdown(match));
}

function convertHtmlTableToMarkdown(tableHtml: string) {
    const rows = Array.from(tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map((rowMatch) => {
        return Array.from(rowMatch[1].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)).map((cellMatch) => normalizeHtmlTableCell(cellMatch[2]));
    }).filter((cells) => cells.length > 0);
    if (rows.length === 0) {
        return tableHtml;
    }

    const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const normalizedRows = rows.map((row) => Array.from({length: columnCount}, (_, index) => escapeMarkdownTableCell(row[index] || '')));
    const separator = Array.from({length: columnCount}, () => '---');

    return [
        `| ${normalizedRows[0].join(' | ')} |`,
        `| ${separator.join(' | ')} |`,
        ...normalizedRows.slice(1).map((row) => `| ${row.join(' | ')} |`),
    ].join('\n');
}

function normalizeHtmlTableCell(cellHtml: string) {
    const text = decodeHtmlEntities(
        cellHtml.
            replace(/<br\s*\/?>/gi, '\n').
            replace(/<[^>]+>/g, ''),
    );
    return text.replace(/\s*\n\s*/g, ' / ').replace(/\s+/g, ' ').trim();
}

function escapeMarkdownTableCell(value: string) {
    return value.replace(/\|/g, '\\|');
}

function decodeHtmlEntities(value: string) {
    return value.
        replace(/&nbsp;/gi, ' ').
        replace(/&amp;/gi, '&').
        replace(/&lt;/gi, '<').
        replace(/&gt;/gi, '>').
        replace(/&quot;/gi, '"').
        replace(/&#39;/gi, '\'').
        replace(/&apos;/gi, '\'');
}

function normalizeFencedCodeBlockLines(lines: string[]) {
    const normalized: string[] = [];
    let inFence = false;
    let fenceMarker = '';
    let firstFenceLine = false;

    for (const line of lines) {
        if (!inFence) {
            const openingFence = matchFenceOpening(line);
            if (openingFence) {
                inFence = true;
                fenceMarker = openingFence;
                firstFenceLine = true;
                normalized.push(line.trimEnd());
                continue;
            }

            normalized.push(line);
            continue;
        }

        if (isFenceClosing(line, fenceMarker)) {
            if (normalized.length > 0 && normalized[normalized.length - 1].trim() === '') {
                normalized.pop();
            }

            inFence = false;
            fenceMarker = '';
            firstFenceLine = false;
            normalized.push(line.trimEnd());
            continue;
        }

        if (firstFenceLine && line.trim() === '') {
            firstFenceLine = false;
            continue;
        }

        firstFenceLine = false;
        normalized.push(line);
    }

    return normalized;
}

function normalizeMarkdownTableLines(lines: string[]) {
    const compacted = compactMarkdownTableIndentation(lines);
    const withoutInnerBlanks: string[] = [];
    let inFence = false;
    let fenceMarker = '';

    for (let index = 0; index < compacted.length; index++) {
        const line = compacted[index];
        if (!inFence) {
            const openingFence = matchFenceOpening(line);
            if (openingFence) {
                inFence = true;
                fenceMarker = openingFence;
                withoutInnerBlanks.push(line);
                continue;
            }
        } else if (isFenceClosing(line, fenceMarker)) {
            inFence = false;
            fenceMarker = '';
            withoutInnerBlanks.push(line);
            continue;
        } else {
            withoutInnerBlanks.push(line);
            continue;
        }

        if (line.trim() !== '') {
            withoutInnerBlanks.push(line);
            continue;
        }

        const previousIndex = findPreviousNonEmptyIndex(compacted, index);
        const nextIndex = findNextNonEmptyIndex(compacted, index);
        const betweenTableLines = previousIndex >= 0 &&
            nextIndex >= 0 &&
            isMarkdownTableLine(compacted[previousIndex]) &&
            isMarkdownTableLine(compacted[nextIndex]);

        if (!betweenTableLines) {
            withoutInnerBlanks.push(line);
        }
    }

    const normalized: string[] = [];
    inFence = false;
    fenceMarker = '';
    for (let index = 0; index < withoutInnerBlanks.length; index++) {
        const line = withoutInnerBlanks[index];
        if (!inFence) {
            const openingFence = matchFenceOpening(line);
            if (openingFence) {
                inFence = true;
                fenceMarker = openingFence;
                normalized.push(line);
                continue;
            }
        } else if (isFenceClosing(line, fenceMarker)) {
            inFence = false;
            fenceMarker = '';
            normalized.push(line);
            continue;
        } else {
            normalized.push(line);
            continue;
        }

        const previous = normalized[normalized.length - 1] || '';
        const previousIsTable = isMarkdownTableLine(previous);
        const currentIsTable = isMarkdownTableLine(line);

        if (currentIsTable && previous.trim() !== '' && !previousIsTable) {
            normalized.push('');
        }

        if (!currentIsTable && line.trim() !== '' && previousIsTable) {
            normalized.push('');
        }

        normalized.push(line);
    }

    return normalized;
}

function compactMarkdownTableIndentation(lines: string[]) {
    const normalized: string[] = [];
    let inFence = false;
    let fenceMarker = '';

    for (const line of lines) {
        if (!inFence) {
            const openingFence = matchFenceOpening(line);
            if (openingFence) {
                inFence = true;
                fenceMarker = openingFence;
                normalized.push(line);
                continue;
            }
        } else if (isFenceClosing(line, fenceMarker)) {
            inFence = false;
            fenceMarker = '';
            normalized.push(line);
            continue;
        } else {
            normalized.push(line);
            continue;
        }

        normalized.push(line.replace(/^\s+(?=\|)/, ''));
    }

    return normalized;
}

function isMarkdownTableLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) {
        return false;
    }
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
        return false;
    }
    return true;
}

function findPreviousNonEmptyIndex(lines: string[], startIndex: number) {
    for (let index = startIndex - 1; index >= 0; index--) {
        if (lines[index].trim() !== '') {
            return index;
        }
    }
    return -1;
}

function findNextNonEmptyIndex(lines: string[], startIndex: number) {
    for (let index = startIndex + 1; index < lines.length; index++) {
        if (lines[index].trim() !== '') {
            return index;
        }
    }
    return -1;
}

function matchFenceOpening(line: string) {
    const match = line.match(/^\s*(`{3,}|~{3,})/);
    return match?.[1] || '';
}

function isFenceClosing(line: string, fenceMarker: string) {
    if (!fenceMarker) {
        return false;
    }

    const escapedMarker = escapeForRegularExpression(fenceMarker);
    return new RegExp(`^\\s*${escapedMarker}\\s*$`).test(line);
}

function escapeForRegularExpression(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

