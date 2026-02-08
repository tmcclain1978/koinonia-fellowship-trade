import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Shield, Info } from 'lucide-react';

interface RiskFlagCardProps {
  riskFlags: string[];
}

export function RiskFlagCard({ riskFlags }: RiskFlagCardProps) {
  if (!riskFlags || riskFlags.length === 0) {
    return (
      <Alert className="bg-emerald-500/10 border-emerald-500/30">
        <Shield className="h-4 w-4 text-emerald-400" />
        <AlertTitle className="text-emerald-400">Low Risk Indicators</AlertTitle>
        <AlertDescription className="text-emerald-300/80">
          No major risk flags detected for this setup.
        </AlertDescription>
      </Alert>
    );
  }

  const isHighRisk = riskFlags.some(flag => 
    flag.toLowerCase().includes('pump') || 
    flag.toLowerCase().includes('dilution') ||
    flag.toLowerCase().includes('extended')
  );

  return (
    <Alert className={isHighRisk 
      ? "bg-red-500/10 border-red-500/30" 
      : "bg-amber-500/10 border-amber-500/30"
    }>
      <AlertTriangle className={`h-4 w-4 ${isHighRisk ? 'text-red-400' : 'text-amber-400'}`} />
      <AlertTitle className={isHighRisk ? 'text-red-400' : 'text-amber-400'}>
        Risk Warnings
      </AlertTitle>
      <AlertDescription>
        <ul className={`mt-2 space-y-1 text-sm ${isHighRisk ? 'text-red-300/80' : 'text-amber-300/80'}`}>
          {riskFlags.map((flag, index) => (
            <li key={index} className="flex items-start gap-2">
              <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{flag}</span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
