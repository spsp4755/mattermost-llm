import React from 'react';

type Props = {
    area: string;
    children: React.ReactNode;
};

type State = {
    hasError: boolean;
    message: string;
};

const containerStyle: React.CSSProperties = {
    background: 'rgba(var(--error-text-color-rgb), 0.08)',
    border: '1px solid rgba(var(--error-text-color-rgb), 0.24)',
    borderRadius: '12px',
    color: 'var(--error-text)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '16px',
};

export default class PluginErrorBoundary extends React.PureComponent<Props, State> {
    public state: State = {
        hasError: false,
        message: '',
    };

    public static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            message: error.message || 'An unexpected error occurred.',
        };
    }

    public componentDidCatch(error: Error, info: React.ErrorInfo) {
        // eslint-disable-next-line no-console
        console.error(`[Mattermost LLM] ${this.props.area} render error`, error, info);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={containerStyle}>
                    <strong>{`${this.props.area} could not be rendered.`}</strong>
                    <span>{this.state.message}</span>
                    <span style={{fontSize: '12px', opacity: 0.85}}>
                        {'Refresh the page or open the panel again. If the problem continues, check the plugin log and browser console.'}
                    </span>
                </div>
            );
        }

        return this.props.children;
    }
}
