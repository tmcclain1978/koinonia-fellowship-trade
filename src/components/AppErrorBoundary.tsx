import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AppErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
};

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep logging simple; this prevents a blank screen when something unexpected happens.
    console.error("[AppErrorBoundary] Unhandled error:", error);
    console.error("[AppErrorBoundary] Component stack:", info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>Something went wrong</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A temporary backend function routing error can happen during deploys. You can reload to recover.
            </p>
            {this.state.error?.message && (
              <pre className="text-xs whitespace-pre-wrap rounded-md bg-muted p-3 border border-border">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={this.handleReload} className="sm:flex-1">
                Reload
              </Button>
              <Button variant="outline" onClick={this.handleGoHome} className="sm:flex-1">
                Go to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
