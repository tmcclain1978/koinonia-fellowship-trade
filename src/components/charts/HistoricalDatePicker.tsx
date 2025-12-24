import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, History } from "lucide-react";
import { format, subDays, subMonths, subYears } from "date-fns";
import { Label } from "@/components/ui/label";

interface HistoricalDatePickerProps {
  startDate: Date | undefined;
  endDate: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
  onApply: () => void;
  isLoading?: boolean;
}

export const HistoricalDatePicker = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApply,
  isLoading
}: HistoricalDatePickerProps) => {
  const [presetPeriod, setPresetPeriod] = useState<string>("");

  const handlePresetChange = (preset: string) => {
    setPresetPeriod(preset);
    const now = new Date();
    let start: Date;

    switch (preset) {
      case "1w":
        start = subDays(now, 7);
        break;
      case "1m":
        start = subMonths(now, 1);
        break;
      case "3m":
        start = subMonths(now, 3);
        break;
      case "6m":
        start = subMonths(now, 6);
        break;
      case "1y":
        start = subYears(now, 1);
        break;
      case "2y":
        start = subYears(now, 2);
        break;
      case "5y":
        start = subYears(now, 5);
        break;
      case "max":
        start = subYears(now, 20);
        break;
      default:
        return;
    }

    onStartDateChange(start);
    onEndDateChange(now);
  };

  return (
    <div className="flex flex-col gap-3 p-3 bg-muted/50 rounded-lg border">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <Label className="text-xs font-medium">Historical Data</Label>
      </div>
      
      <div className="flex flex-wrap items-center gap-2">
        {/* Quick presets */}
        <Select value={presetPeriod} onValueChange={handlePresetChange}>
          <SelectTrigger className="h-8 w-28">
            <SelectValue placeholder="Quick select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1w">1 Week</SelectItem>
            <SelectItem value="1m">1 Month</SelectItem>
            <SelectItem value="3m">3 Months</SelectItem>
            <SelectItem value="6m">6 Months</SelectItem>
            <SelectItem value="1y">1 Year</SelectItem>
            <SelectItem value="2y">2 Years</SelectItem>
            <SelectItem value="5y">5 Years</SelectItem>
            <SelectItem value="max">Max</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground">or</span>

        {/* Start date picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2">
              <CalendarIcon className="h-3 w-3" />
              {startDate ? format(startDate, "MMM dd, yyyy") : "Start date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={onStartDateChange}
              disabled={(date) => date > new Date()}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <span className="text-xs text-muted-foreground">to</span>

        {/* End date picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2">
              <CalendarIcon className="h-3 w-3" />
              {endDate ? format(endDate, "MMM dd, yyyy") : "End date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={onEndDateChange}
              disabled={(date) => date > new Date() || (startDate ? date < startDate : false)}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Button 
          size="sm" 
          className="h-8" 
          onClick={onApply}
          disabled={isLoading || !startDate || !endDate}
        >
          {isLoading ? "Loading..." : "Load History"}
        </Button>
      </div>

      {startDate && endDate && (
        <div className="text-xs text-muted-foreground">
          Showing data from {format(startDate, "MMM dd, yyyy")} to {format(endDate, "MMM dd, yyyy")}
        </div>
      )}
    </div>
  );
};
