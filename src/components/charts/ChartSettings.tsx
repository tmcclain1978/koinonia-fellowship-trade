import { Button } from "@/components/ui/button";
import { RefreshCw, Settings } from "lucide-react";
import type { Chart } from "klinecharts";

interface ChartSettingsProps {
  chart: Chart | null;
  onRefresh: () => void;
}

export const ChartSettings = ({ chart, onRefresh }: ChartSettingsProps) => {
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={onRefresh}>
        <RefreshCw className="w-4 h-4" />
      </Button>
      <Button variant="outline" size="sm">
        <Settings className="w-4 h-4" />
      </Button>
    </div>
  );
};
