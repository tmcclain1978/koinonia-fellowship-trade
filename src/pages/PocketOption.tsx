import { useState } from "react";
import Navigation from "@/components/Navigation";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PocketOptionConnection from "@/components/PocketOptionConnection";
import PocketOptionPatternEngine from "@/components/PocketOptionPatternEngine";
import { Activity } from "lucide-react";

const PocketOption = () => {
  const [isConnected, setIsConnected] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-accent rounded-full flex items-center justify-center shadow-glow">
              <Activity className="w-5 h-5 text-accent-foreground" />
            </div>
            <h1 className="text-3xl font-display font-bold text-foreground">
              PocketOption Trading
            </h1>
          </div>
          <p className="text-muted-foreground">
            Live candle patterns, checked against your own saved history
          </p>
        </div>

        <Tabs defaultValue="connection" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="connection">Connection</TabsTrigger>
            <TabsTrigger value="patterns">
              Pattern Engine
            </TabsTrigger>
          </TabsList>

          <TabsContent value="connection">
            <PocketOptionConnection 
              onConnectionChange={setIsConnected}
              isConnected={isConnected}
            />
          </TabsContent>

          <TabsContent value="patterns">
            <PocketOptionPatternEngine />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default PocketOption;
