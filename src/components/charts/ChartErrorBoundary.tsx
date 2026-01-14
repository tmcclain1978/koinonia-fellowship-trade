import React, { Component, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw, Database, WifiOff } from 'lucide-react';

interface ChartErrorBoundaryProps {
  children: ReactNode;
  symbol?: string;
  interval?: string;
  onRetry?: () => void;
  onUseCachedData?: () => void;
  fallbackComponent?: ReactNode;
}

interface ChartErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  retryCount: number;
}

/**
 * Error boundary specifically designed for chart components
 * Provides recovery options and graceful degradation
 */
export class ChartErrorBoundary extends Component<ChartErrorBoundaryProps, ChartErrorBoundaryState> {
  private maxRetries = 3;

  constructor(props: ChartErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ChartErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    
    // Log error for monitoring (could be sent to analytics service)
    console.error('[ChartErrorBoundary] Chart error caught:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      symbol: this.props.symbol,
      interval: this.props.interval,
    });
  }

  handleRetry = () => {
    const { retryCount } = this.state;
    
    if (retryCount < this.maxRetries) {
      this.setState(prevState => ({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: prevState.retryCount + 1,
      }));
      
      this.props.onRetry?.();
    }
  };

  handleUseCachedData = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    
    this.props.onUseCachedData?.();
  };

  getErrorType(): 'network' | 'render' | 'data' | 'unknown' {
    const { error } = this.state;
    if (!error) return 'unknown';
    
    const message = error.message.toLowerCase();
    
    if (message.includes('fetch') || message.includes('network') || message.includes('failed to load')) {
      return 'network';
    }
    if (message.includes('undefined') || message.includes('null') || message.includes('cannot read')) {
      return 'data';
    }
    if (message.includes('render') || message.includes('react')) {
      return 'render';
    }
    
    return 'unknown';
  }

  renderErrorUI() {
    const { error, retryCount } = this.state;
    const { symbol, onUseCachedData } = this.props;
    const errorType = this.getErrorType();
    const canRetry = retryCount < this.maxRetries;
    
    const errorMessages = {
      network: {
        icon: WifiOff,
        title: 'Connection Issue',
        description: 'Unable to fetch chart data. This could be due to network issues or the market data service being temporarily unavailable.',
      },
      data: {
        icon: Database,
        title: 'Data Error',
        description: 'There was a problem processing the chart data. This may be due to missing or malformed market data.',
      },
      render: {
        icon: AlertTriangle,
        title: 'Display Error',
        description: 'The chart encountered a rendering issue. This is typically a temporary problem that can be resolved by refreshing.',
      },
      unknown: {
        icon: AlertTriangle,
        title: 'Chart Error',
        description: 'An unexpected error occurred while displaying the chart.',
      },
    };
    
    const errorConfig = errorMessages[errorType];
    const IconComponent = errorConfig.icon;

    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-destructive">
            <IconComponent className="w-5 h-5" />
            {errorConfig.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Chart Failed to Load</AlertTitle>
            <AlertDescription>
              {errorConfig.description}
              {symbol && (
                <span className="block mt-1 text-xs opacity-70">
                  Symbol: {symbol}
                </span>
              )}
            </AlertDescription>
          </Alert>
          
          {error && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">
                Technical Details
              </summary>
              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-32">
                {error.message}
              </pre>
            </details>
          )}
          
          <div className="flex gap-2 flex-wrap">
            {canRetry && (
              <Button
                variant="default"
                size="sm"
                onClick={this.handleRetry}
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Retry ({this.maxRetries - retryCount} left)
              </Button>
            )}
            
            {onUseCachedData && (
              <Button
                variant="outline"
                size="sm"
                onClick={this.handleUseCachedData}
                className="gap-2"
              >
                <Database className="w-4 h-4" />
                Use Cached Data
              </Button>
            )}
            
            {!canRetry && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </Button>
            )}
          </div>
          
          {retryCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Retry attempt {retryCount} of {this.maxRetries}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  render() {
    const { hasError } = this.state;
    const { children, fallbackComponent } = this.props;
    
    if (hasError) {
      return fallbackComponent || this.renderErrorUI();
    }
    
    return children;
  }
}

export default ChartErrorBoundary;
