import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Target, 
  Shield, 
  Brain, 
  BarChart3,
  Lightbulb,
  Clock,
  DollarSign
} from "lucide-react";
import { useMemo } from "react";

interface FormattedAIInsightProps {
  analysis: string;
  className?: string;
}

interface ParsedSection {
  title: string;
  icon: React.ReactNode;
  content: string[];
  type: 'bullish' | 'bearish' | 'neutral' | 'warning' | 'info';
}

const FormattedAIInsight = ({ analysis, className = "" }: FormattedAIInsightProps) => {
  const parsedSections = useMemo(() => {
    if (!analysis) return [];

    // Clean up the analysis text
    let cleanText = analysis
      .replace(/\*\*/g, '') // Remove bold markers
      .replace(/\*/g, '')   // Remove italic markers
      .replace(/#{1,6}\s*/g, '') // Remove markdown headers
      .replace(/---+/g, '') // Remove horizontal rules
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .trim();

    const sections: ParsedSection[] = [];

    // Define category patterns to detect
    const categoryPatterns = [
      { 
        regex: /(?:summary|overview|executive summary|analysis summary)[:\s]*([^]*?)(?=(?:technical|fundamental|sentiment|risk|recommendation|support|resistance|entry|exit|target|stop|key level|price action|trend|$))/i,
        title: 'Summary',
        icon: <Brain className="w-4 h-4" />,
        type: 'info' as const
      },
      { 
        regex: /(?:technical analysis|technical indicators?|technicals)[:\s]*([^]*?)(?=(?:fundamental|sentiment|risk|recommendation|support|resistance|entry|exit|target|stop|key level|summary|$))/i,
        title: 'Technical Analysis',
        icon: <BarChart3 className="w-4 h-4" />,
        type: 'info' as const
      },
      { 
        regex: /(?:trend|price action|momentum)[:\s]*([^]*?)(?=(?:technical|fundamental|sentiment|risk|recommendation|support|resistance|entry|exit|target|stop|key level|summary|$))/i,
        title: 'Trend & Momentum',
        icon: <TrendingUp className="w-4 h-4" />,
        type: 'info' as const
      },
      { 
        regex: /(?:support|resistance|key levels?)[:\s]*([^]*?)(?=(?:technical|fundamental|sentiment|risk|recommendation|entry|exit|target|stop|trend|summary|$))/i,
        title: 'Key Levels',
        icon: <Target className="w-4 h-4" />,
        type: 'neutral' as const
      },
      { 
        regex: /(?:risk|risks?|warning|caution)[:\s]*([^]*?)(?=(?:technical|fundamental|sentiment|recommendation|support|resistance|entry|exit|target|stop|key level|summary|$))/i,
        title: 'Risk Factors',
        icon: <AlertTriangle className="w-4 h-4" />,
        type: 'warning' as const
      },
      { 
        regex: /(?:entry|exit|trade setup|trading plan|strategy)[:\s]*([^]*?)(?=(?:technical|fundamental|sentiment|risk|recommendation|support|resistance|target|stop|key level|summary|$))/i,
        title: 'Trade Setup',
        icon: <Clock className="w-4 h-4" />,
        type: 'info' as const
      },
      { 
        regex: /(?:target|price target|profit target|take profit)[:\s]*([^]*?)(?=(?:technical|fundamental|sentiment|risk|recommendation|support|resistance|entry|exit|stop|key level|summary|$))/i,
        title: 'Price Targets',
        icon: <DollarSign className="w-4 h-4" />,
        type: 'bullish' as const
      },
      { 
        regex: /(?:stop loss|stop|protective stop)[:\s]*([^]*?)(?=(?:technical|fundamental|sentiment|risk|recommendation|support|resistance|entry|exit|target|key level|summary|$))/i,
        title: 'Stop Loss',
        icon: <Shield className="w-4 h-4" />,
        type: 'warning' as const
      },
      { 
        regex: /(?:recommendation|conclusion|verdict|outlook|bias)[:\s]*([^]*?)(?=(?:technical|fundamental|sentiment|risk|support|resistance|entry|exit|target|stop|key level|summary|$))/i,
        title: 'Recommendation',
        icon: <Lightbulb className="w-4 h-4" />,
        type: 'info' as const
      },
      { 
        regex: /(?:bullish|positive|upside)[:\s]*([^]*?)(?=(?:bearish|negative|downside|technical|fundamental|sentiment|risk|recommendation|support|resistance|entry|exit|target|stop|key level|summary|$))/i,
        title: 'Bullish Factors',
        icon: <TrendingUp className="w-4 h-4" />,
        type: 'bullish' as const
      },
      { 
        regex: /(?:bearish|negative|downside)[:\s]*([^]*?)(?=(?:bullish|positive|upside|technical|fundamental|sentiment|risk|recommendation|support|resistance|entry|exit|target|stop|key level|summary|$))/i,
        title: 'Bearish Factors',
        icon: <TrendingDown className="w-4 h-4" />,
        type: 'bearish' as const
      },
    ];

    // Try to extract sections based on patterns
    let foundSections = false;
    for (const pattern of categoryPatterns) {
      const match = cleanText.match(pattern.regex);
      if (match && match[1]?.trim()) {
        const content = match[1]
          .split(/[\n\r]+/)
          .map(line => line.replace(/^[-•●◦▪]\s*/, '').trim())
          .filter(line => line.length > 5);
        
        if (content.length > 0) {
          foundSections = true;
          sections.push({
            title: pattern.title,
            icon: pattern.icon,
            content,
            type: pattern.type
          });
        }
      }
    }

    // If no sections found, create a general breakdown by paragraphs/sentences
    if (!foundSections) {
      const paragraphs = cleanText.split(/\n\n+/).filter(p => p.trim());
      
      if (paragraphs.length >= 3) {
        // Split into logical sections
        const third = Math.ceil(paragraphs.length / 3);
        
        sections.push({
          title: 'Analysis Overview',
          icon: <Brain className="w-4 h-4" />,
          content: paragraphs.slice(0, third).map(p => p.trim()),
          type: 'info'
        });
        
        sections.push({
          title: 'Key Observations',
          icon: <BarChart3 className="w-4 h-4" />,
          content: paragraphs.slice(third, third * 2).map(p => p.trim()),
          type: 'neutral'
        });
        
        sections.push({
          title: 'Trading Considerations',
          icon: <Lightbulb className="w-4 h-4" />,
          content: paragraphs.slice(third * 2).map(p => p.trim()),
          type: 'info'
        });
      } else {
        // Just one section for short content
        const lines = cleanText
          .split(/[\n\r]+/)
          .map(line => line.replace(/^[-•●◦▪]\s*/, '').trim())
          .filter(line => line.length > 5);
        
        sections.push({
          title: 'Analysis',
          icon: <Brain className="w-4 h-4" />,
          content: lines,
          type: 'info'
        });
      }
    }

    return sections;
  }, [analysis]);

  const getTypeStyles = (type: ParsedSection['type']) => {
    switch (type) {
      case 'bullish':
        return 'bg-success/10 border-success/20 text-success';
      case 'bearish':
        return 'bg-destructive/10 border-destructive/20 text-destructive';
      case 'warning':
        return 'bg-warning/10 border-warning/20 text-warning';
      case 'neutral':
        return 'bg-muted/50 border-border text-muted-foreground';
      default:
        return 'bg-primary/5 border-primary/20 text-primary';
    }
  };

  const getIconStyles = (type: ParsedSection['type']) => {
    switch (type) {
      case 'bullish':
        return 'text-success';
      case 'bearish':
        return 'text-destructive';
      case 'warning':
        return 'text-warning';
      case 'neutral':
        return 'text-muted-foreground';
      default:
        return 'text-primary';
    }
  };

  if (!analysis || parsedSections.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {parsedSections.map((section, idx) => (
        <div 
          key={idx} 
          className={`rounded-lg border p-4 ${getTypeStyles(section.type)}`}
        >
          <div className={`flex items-center gap-2 mb-3 font-semibold ${getIconStyles(section.type)}`}>
            {section.icon}
            <span>{section.title}</span>
          </div>
          <div className="space-y-2 text-foreground">
            {section.content.map((item, itemIdx) => (
              <p 
                key={itemIdx} 
                className="text-sm leading-relaxed"
              >
                {section.content.length > 1 && (
                  <span className="text-muted-foreground mr-2">•</span>
                )}
                {item}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default FormattedAIInsight;
