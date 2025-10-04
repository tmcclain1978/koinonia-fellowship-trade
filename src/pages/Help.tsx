import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, BookOpen, Settings as SettingsIcon, LineChart, Shield } from "lucide-react";

const Help = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pt-16">
      <div className="container mx-auto p-6 max-w-4xl">
        <Button
          variant="ghost"
          onClick={() => navigate("/dashboard")}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="flex items-center gap-3 mb-8">
          <BookOpen className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Help & Documentation</h1>
        </div>

        <Tabs defaultValue="getting-started" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="getting-started">Getting Started</TabsTrigger>
            <TabsTrigger value="schwab">Schwab Setup</TabsTrigger>
            <TabsTrigger value="trading">Trading Guide</TabsTrigger>
            <TabsTrigger value="faq">FAQ</TabsTrigger>
          </TabsList>

          <TabsContent value="getting-started" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Welcome to the Platform</CardTitle>
                <CardDescription>Learn the basics of using our trading platform</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    1. Create Your Account
                  </h3>
                  <p className="text-muted-foreground">
                    Sign up for a free account to get started. You'll automatically be assigned a Free User role with limited features.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <SettingsIcon className="h-4 w-4" />
                    2. Configure Your Settings
                  </h3>
                  <p className="text-muted-foreground">
                    Navigate to Settings to configure your Schwab API credentials and choose between paper trading and live trading modes.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <LineChart className="h-4 w-4" />
                    3. Start Trading
                  </h3>
                  <p className="text-muted-foreground">
                    Once configured, head to the Trading page to start analyzing options chains and placing orders.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>User Roles</CardTitle>
                <CardDescription>Understanding access levels</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <h4 className="font-semibold">Free User</h4>
                  <p className="text-sm text-muted-foreground">
                    Limited access to basic features and paper trading only.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold">User</h4>
                  <p className="text-sm text-muted-foreground">
                    Full access to trading features, live trading, and advanced analytics.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold">Admin</h4>
                  <p className="text-sm text-muted-foreground">
                    Complete system access including user management and subscription controls.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schwab" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Schwab API Integration Setup</CardTitle>
                <CardDescription>Step-by-step guide to connect your Schwab account</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Step 1: Access Schwab Developer Portal</h3>
                  <p className="text-muted-foreground mb-2">
                    Visit the Schwab Developer Portal and log in with your Schwab account credentials.
                  </p>
                  <code className="bg-muted px-2 py-1 rounded text-sm">
                    https://developer.schwab.com/
                  </code>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Step 2: Create an Application</h3>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1">
                    <li>Navigate to "My Apps" section</li>
                    <li>Click "Create New App"</li>
                    <li>Fill in application details (name, description)</li>
                    <li>Select the API permissions you need (Trading, Market Data)</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Step 3: Get Your Credentials</h3>
                  <p className="text-muted-foreground mb-2">
                    After creating your app, you'll receive:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1">
                    <li><strong>Client ID</strong> - Your application identifier</li>
                    <li><strong>Client Secret</strong> - Your application's secret key (keep this secure!)</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Step 4: Configure in Settings</h3>
                  <p className="text-muted-foreground mb-2">
                    In our platform:
                  </p>
                  <ol className="list-decimal list-inside text-muted-foreground space-y-1">
                    <li>Navigate to Settings page</li>
                    <li>Enter your Schwab Client ID</li>
                    <li>Enter your Schwab Client Secret</li>
                    <li>Click "Save Credentials"</li>
                  </ol>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                  <h4 className="font-semibold text-amber-700 dark:text-amber-400 mb-2">⚠️ Important Security Notes</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Never share your Client Secret with anyone</li>
                    <li>• Your credentials are encrypted and stored securely</li>
                    <li>• Only you can access your API credentials</li>
                    <li>• You can update or remove credentials anytime in Settings</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trading" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Trading Modes</CardTitle>
                <CardDescription>Understanding Paper vs Live Trading</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Paper Trading Mode</h3>
                  <p className="text-muted-foreground">
                    Practice trading with virtual money. Perfect for learning and testing strategies without financial risk.
                    All orders are simulated and no real money is involved.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Live Trading Mode</h3>
                  <p className="text-muted-foreground">
                    Execute real trades with your Schwab account. Requires a paid subscription and properly configured
                    Schwab API credentials. All orders will be sent to Schwab for execution.
                  </p>
                </div>

                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                  <h4 className="font-semibold text-red-700 dark:text-red-400 mb-2">⚠️ Live Trading Warning</h4>
                  <p className="text-sm text-muted-foreground">
                    Live trading involves real money and real risk. Make sure you understand the risks before enabling
                    live trading mode. Always start with paper trading to familiarize yourself with the platform.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Placing Orders</CardTitle>
                <CardDescription>How to use the order builder</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-muted-foreground">
                  The order builder supports various order types and structures:
                </p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li><strong>Single Leg</strong> - Simple call or put option</li>
                  <li><strong>Multi-Leg</strong> - Custom multi-option strategies</li>
                  <li><strong>Vertical Spread</strong> - Bull/bear call or put spreads</li>
                  <li><strong>Covered Stock</strong> - Stock position with option overlay</li>
                  <li><strong>Iron Condor</strong> - Advanced neutral strategy</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="faq" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Frequently Asked Questions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">How do I upgrade my account?</h3>
                  <p className="text-muted-foreground">
                    Contact an administrator to upgrade your account from Free User to a paid subscription.
                    Admins can manage subscriptions through the Admin Portal.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Is my data secure?</h3>
                  <p className="text-muted-foreground">
                    Yes! All sensitive data including API credentials are encrypted at rest and in transit.
                    Your credentials are never shared with other users.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Can I switch between paper and live trading?</h3>
                  <p className="text-muted-foreground">
                    Yes! You can switch trading modes anytime in the Settings page. We recommend starting with
                    paper trading to familiarize yourself with the platform.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">What happens if my Schwab API credentials expire?</h3>
                  <p className="text-muted-foreground">
                    You'll need to update them in Settings. The platform will notify you if there are authentication
                    issues with your credentials.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Help;