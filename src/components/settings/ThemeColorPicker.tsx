import { useTheme, themes, ThemeName } from '@/contexts/ThemeContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Cloud, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';

const ThemeColorPicker = () => {
  const { theme, setTheme, isSyncing } = useTheme();

  const themeOptions = Object.values(themes);

  return (
    <Card className="glass-card border-white/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-foreground">Theme Color</CardTitle>
            <CardDescription>Choose your preferred color scheme</CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isSyncing ? (
              <>
                <Cloud className="w-4 h-4 animate-pulse text-primary" />
                <span>Syncing...</span>
              </>
            ) : (
              <>
                <Cloud className="w-4 h-4 text-success" />
                <span>Synced</span>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
          {themeOptions.map((themeOption) => (
            <button
              key={themeOption.name}
              onClick={() => setTheme(themeOption.name)}
              className={cn(
                "group flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-300",
                "hover:bg-white/5",
                theme === themeOption.name && "bg-white/10"
              )}
            >
              <div
                className={cn(
                  "relative w-12 h-12 rounded-full transition-all duration-300",
                  "ring-2 ring-offset-2 ring-offset-background",
                  theme === themeOption.name 
                    ? "ring-primary scale-110" 
                    : "ring-transparent group-hover:ring-white/30"
                )}
                style={{ background: themeOption.preview }}
              >
                {theme === themeOption.name && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Check className="w-5 h-5 text-white drop-shadow-lg" />
                  </div>
                )}
              </div>
              <span className={cn(
                "text-xs font-medium transition-colors",
                theme === themeOption.name ? "text-primary" : "text-muted-foreground"
              )}>
                {themeOption.label}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Current: <span className="text-primary font-medium">{themes[theme].label}</span>
          <span className="ml-2 text-xs">(syncs across all your devices)</span>
        </p>
      </CardContent>
    </Card>
  );
};

export default ThemeColorPicker;
