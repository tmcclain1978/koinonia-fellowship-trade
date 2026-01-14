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
  DollarSign,
  CheckCircle,
  XCircle,
  Activity
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
  type: 'bullish' | 'bearish' | 'neutral' | 'warning' | 'info' | 'success';
}

// Clean text by removing all special characters and markdown
const cleanText = (text: string): string => {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold markers but keep text
    .replace(/\*([^*]+)\*/g, '$1')     // Remove italic markers but keep text
    .replace(/#{1,6}\s*/g, '')         // Remove markdown headers
    .replace(/---+/g, '')              // Remove horizontal rules
    .replace(/```[\s\S]*?```/g, '')    // Remove code blocks
    .replace(/`([^`]+)`/g, '$1')       // Remove inline code markers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links but keep text
    .replace(/[•●◦▪►▸→←↑↓]/g, '')      // Remove bullet characters
    .replace(/^\s*[-*+]\s+/gm, '')     // Remove list markers
    .replace(/^\s*\d+\.\s+/gm, '')     // Remove numbered list markers
    .replace(/\n{3,}/g, '\n\n')        // Reduce multiple newlines
    .trim();
};

// Extract clean sentences from text
const extractSentences = (text: string): string[] => {
  const cleaned = cleanText(text);
  return cleaned
    .split(/[.\n]/)
    .map(s => s.trim())
    .filter(s => s.length > 10 && !s.match(/^(summary|overview|analysis|recommendation|risk|conclusion|technical|fundamental)$/i));
};

const FormattedAIInsight = ({ analysis, className = "" }: FormattedAIInsightProps) => {
  const parsedSections = useMemo(() => {
    if (!analysis) return [];

    const cleaned = cleanText(analysis);
    const sections: ParsedSection[] = [];

    // Define section detection with keyword groups
    const sectionDefinitions = [
      {
        keywords: ['what went well', 'strength', 'good execution', 'positive', 'success', 'correctly', 'well done'],
        title: 'What Went Well',
        icon: <CheckCircle className="w-4 h-4" />,
        type: 'success' as const
      },
      {
        keywords: ['what went wrong', 'mistake', 'error', 'failure', 'poorly', 'should not', 'avoid'],
        title: 'Areas for Improvement',
        icon: <XCircle className="w-4 h-4" />,
        type: 'warning' as const
      },
      {
        keywords: ['pattern', 'behavior', 'tendency', 'habit', 'recurring', 'often', 'typically'],
        title: 'Behavioral Patterns',
        icon: <Activity className="w-4 h-4" />,
        type: 'info' as const
      },
      {
        keywords: ['risk', 'danger', 'caution', 'warning', 'careful', 'beware'],
        title: 'Risk Assessment',
        icon: <AlertTriangle className="w-4 h-4" />,
        type: 'warning' as const
      },
      {
        keywords: ['entry', 'exit', 'setup', 'trigger', 'signal', 'confirmation'],
        title: 'Trade Execution',
        icon: <Target className="w-4 h-4" />,
        type: 'info' as const
      },
      {
        keywords: ['emotional', 'psychology', 'discipline', 'fear', 'greed', 'fomo', 'patience', 'impulse'],
        title: 'Trading Psychology',
        icon: <Brain className="w-4 h-4" />,
        type: 'neutral' as const
      },
      {
        keywords: ['improve', 'next time', 'suggestion', 'recommend', 'consider', 'try', 'should'],
        title: 'Recommendations',
        icon: <Lightbulb className="w-4 h-4" />,
        type: 'info' as const
      },
      {
        keywords: ['stop loss', 'stop', 'protective', 'max loss'],
        title: 'Risk Management',
        icon: <Shield className="w-4 h-4" />,
        type: 'warning' as const
      },
      {
        keywords: ['target', 'profit', 'gain', 'upside', 'potential'],
        title: 'Profit Potential',
        icon: <DollarSign className="w-4 h-4" />,
        type: 'bullish' as const
      },
      {
        keywords: ['technical', 'indicator', 'chart', 'support', 'resistance', 'trend', 'momentum'],
        title: 'Technical Analysis',
        icon: <BarChart3 className="w-4 h-4" />,
        type: 'info' as const
      },
      {
        keywords: ['bullish', 'uptrend', 'buy', 'long', 'positive momentum'],
        title: 'Bullish Factors',
        icon: <TrendingUp className="w-4 h-4" />,
        type: 'bullish' as const
      },
      {
        keywords: ['bearish', 'downtrend', 'sell', 'short', 'negative momentum'],
        title: 'Bearish Factors',
        icon: <TrendingDown className="w-4 h-4" />,
        type: 'bearish' as const
      },
      {
        keywords: ['timing', 'when', 'duration', 'timeframe', 'period'],
        title: 'Timing Analysis',
        icon: <Clock className="w-4 h-4" />,
        type: 'neutral' as const
      }
    ];

    // Split content into paragraphs
    const paragraphs = cleaned.split(/\n\n+/).filter(p => p.trim().length > 20);
    
    // Analyze each paragraph and assign to appropriate section
    const sectionContent: Map<string, string[]> = new Map();
    
    paragraphs.forEach(para => {
      const lowerPara = para.toLowerCase();
      let matched = false;
      
      for (const def of sectionDefinitions) {
        const matchCount = def.keywords.filter(kw => lowerPara.includes(kw)).length;
        if (matchCount >= 1) {
          if (!sectionContent.has(def.title)) {
            sectionContent.set(def.title, []);
          }
          // Clean and add the paragraph
          const cleanedPara = para.split(/[.\n]/)
            .map(s => s.trim())
            .filter(s => s.length > 15)
            .join('. ');
          if (cleanedPara) {
            sectionContent.get(def.title)!.push(cleanedPara);
          }
          matched = true;
          break;
        }
      }
      
      // If no match, add to a general section
      if (!matched) {
        if (!sectionContent.has('Key Insights')) {
          sectionContent.set('Key Insights', []);
        }
        const cleanedPara = para.split(/[.\n]/)
          .map(s => s.trim())
          .filter(s => s.length > 15)
          .join('. ');
        if (cleanedPara) {
          sectionContent.get('Key Insights')!.push(cleanedPara);
        }
      }
    });

    // Convert to sections array
    const orderedTitles = [
      'What Went Well',
      'Areas for Improvement',
      'Behavioral Patterns',
      'Trading Psychology',
      'Technical Analysis',
      'Trade Execution',
      'Risk Assessment',
      'Risk Management',
      'Profit Potential',
      'Bullish Factors',
      'Bearish Factors',
      'Timing Analysis',
      'Recommendations',
      'Key Insights'
    ];

    orderedTitles.forEach(title => {
      const content = sectionContent.get(title);
      if (content && content.length > 0) {
        const def = sectionDefinitions.find(d => d.title === title) || {
          title: 'Key Insights',
          icon: <Lightbulb className="w-4 h-4" />,
          type: 'info' as const
        };
        
        sections.push({
          title: def.title,
          icon: def.icon,
          content: content,
          type: def.type
        });
      }
    });

    // If no sections were created, create a simple breakdown
    if (sections.length === 0 && cleaned.length > 0) {
      const sentences = extractSentences(cleaned);
      if (sentences.length > 0) {
        sections.push({
          title: 'Key Insights',
          icon: <Lightbulb className="w-4 h-4" />,
          content: sentences.slice(0, 5),
          type: 'info'
        });
      }
    }

    return sections;
  }, [analysis]);

  const getTypeStyles = (type: ParsedSection['type']) => {
    switch (type) {
      case 'success':
        return 'bg-success/10 border-l-4 border-l-success border-t-0 border-r-0 border-b-0';
      case 'bullish':
        return 'bg-success/10 border-l-4 border-l-success border-t-0 border-r-0 border-b-0';
      case 'bearish':
        return 'bg-destructive/10 border-l-4 border-l-destructive border-t-0 border-r-0 border-b-0';
      case 'warning':
        return 'bg-warning/10 border-l-4 border-l-warning border-t-0 border-r-0 border-b-0';
      case 'neutral':
        return 'bg-muted/50 border-l-4 border-l-muted-foreground border-t-0 border-r-0 border-b-0';
      default:
        return 'bg-primary/5 border-l-4 border-l-primary border-t-0 border-r-0 border-b-0';
    }
  };

  const getIconColor = (type: ParsedSection['type']) => {
    switch (type) {
      case 'success':
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
    <div className={`space-y-3 ${className}`}>
      {parsedSections.map((section, idx) => (
        <div 
          key={idx} 
          className={`rounded-lg p-4 ${getTypeStyles(section.type)}`}
        >
          <div className={`flex items-center gap-2 mb-3 font-semibold text-sm uppercase tracking-wide ${getIconColor(section.type)}`}>
            {section.icon}
            <span>{section.title}</span>
          </div>
          <div className="space-y-2">
            {section.content.map((item, itemIdx) => (
              <p 
                key={itemIdx} 
                className="text-sm text-foreground leading-relaxed pl-6"
              >
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
