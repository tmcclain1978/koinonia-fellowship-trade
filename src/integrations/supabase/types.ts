export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      account_equity_snapshots: {
        Row: {
          account_kind: string
          account_ref: string
          as_of_date: string
          cash: number | null
          created_at: string
          equity: number
          id: string
          net_flows: number
          positions_value: number | null
          series_key: string
          unpriced_positions: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_kind: string
          account_ref: string
          as_of_date: string
          cash?: number | null
          created_at?: string
          equity: number
          id?: string
          net_flows?: number
          positions_value?: number | null
          series_key?: string
          unpriced_positions?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_kind?: string
          account_ref?: string
          as_of_date?: string
          cash?: number | null
          created_at?: string
          equity?: number
          id?: string
          net_flows?: number
          positions_value?: number | null
          series_key?: string
          unpriced_positions?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_prediction_logs: {
        Row: {
          actual_close: number | null
          actual_high: number | null
          actual_low: number | null
          actual_open: number | null
          confidence: number
          created_at: string
          direction_correct: boolean | null
          evaluated_at: string | null
          high_accuracy_pct: number | null
          id: string
          key_level: number
          low_accuracy_pct: number | null
          overall_score: number | null
          predicted_at: string
          predicted_direction: string
          predicted_high: number
          predicted_low: number
          reasoning: string | null
          symbol: string
          trading_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_close?: number | null
          actual_high?: number | null
          actual_low?: number | null
          actual_open?: number | null
          confidence: number
          created_at?: string
          direction_correct?: boolean | null
          evaluated_at?: string | null
          high_accuracy_pct?: number | null
          id?: string
          key_level: number
          low_accuracy_pct?: number | null
          overall_score?: number | null
          predicted_at?: string
          predicted_direction: string
          predicted_high: number
          predicted_low: number
          reasoning?: string | null
          symbol: string
          trading_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_close?: number | null
          actual_high?: number | null
          actual_low?: number | null
          actual_open?: number | null
          confidence?: number
          created_at?: string
          direction_correct?: boolean | null
          evaluated_at?: string | null
          high_accuracy_pct?: number | null
          id?: string
          key_level?: number
          low_accuracy_pct?: number | null
          overall_score?: number | null
          predicted_at?: string
          predicted_direction?: string
          predicted_high?: number
          predicted_low?: number
          reasoning?: string | null
          symbol?: string
          trading_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      auto_trades_log: {
        Row: {
          action: string
          executed_at: string | null
          id: string
          price: number
          quantity: number
          reasoning: string | null
          status: string | null
          symbol: string
          user_id: string
        }
        Insert: {
          action: string
          executed_at?: string | null
          id?: string
          price: number
          quantity: number
          reasoning?: string | null
          status?: string | null
          symbol: string
          user_id: string
        }
        Update: {
          action?: string
          executed_at?: string | null
          id?: string
          price?: number
          quantity?: number
          reasoning?: string | null
          status?: string | null
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      auto_trading_settings: {
        Row: {
          ai_confirm: boolean
          allowed_symbols: string[] | null
          bot_mode: string
          breakeven_at_1r: boolean
          created_at: string | null
          enabled: boolean | null
          engine_lock_until: string | null
          flatten_requested_at: string | null
          id: string
          last_run_at: string | null
          last_scan_bar: string | null
          last_status: string | null
          live_armed_at: string | null
          max_daily_loss: number | null
          max_daily_trades: number | null
          max_open_positions: number
          max_position_size: number | null
          max_session_trades: number | null
          max_weekly_loss: number | null
          min_confidence_threshold: number | null
          notify_email: boolean
          paper_capital: number
          paused: boolean
          pdt_guard: boolean
          portfolio_stop_loss_percent: number | null
          reward_risk: number
          risk_per_trade_pct: number
          risk_tolerance: string | null
          slippage_bps: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_confirm?: boolean
          allowed_symbols?: string[] | null
          bot_mode?: string
          breakeven_at_1r?: boolean
          created_at?: string | null
          enabled?: boolean | null
          engine_lock_until?: string | null
          flatten_requested_at?: string | null
          id?: string
          last_run_at?: string | null
          last_scan_bar?: string | null
          last_status?: string | null
          live_armed_at?: string | null
          max_daily_loss?: number | null
          max_daily_trades?: number | null
          max_open_positions?: number
          max_position_size?: number | null
          max_session_trades?: number | null
          max_weekly_loss?: number | null
          min_confidence_threshold?: number | null
          notify_email?: boolean
          paper_capital?: number
          paused?: boolean
          pdt_guard?: boolean
          portfolio_stop_loss_percent?: number | null
          reward_risk?: number
          risk_per_trade_pct?: number
          risk_tolerance?: string | null
          slippage_bps?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_confirm?: boolean
          allowed_symbols?: string[] | null
          bot_mode?: string
          breakeven_at_1r?: boolean
          created_at?: string | null
          enabled?: boolean | null
          engine_lock_until?: string | null
          flatten_requested_at?: string | null
          id?: string
          last_run_at?: string | null
          last_scan_bar?: string | null
          last_status?: string | null
          live_armed_at?: string | null
          max_daily_loss?: number | null
          max_daily_trades?: number | null
          max_open_positions?: number
          max_position_size?: number | null
          max_session_trades?: number | null
          max_weekly_loss?: number | null
          min_confidence_threshold?: number | null
          notify_email?: boolean
          paper_capital?: number
          paused?: boolean
          pdt_guard?: boolean
          portfolio_stop_loss_percent?: number | null
          reward_risk?: number
          risk_per_trade_pct?: number
          risk_tolerance?: string | null
          slippage_bps?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      backtest_results: {
        Row: {
          avg_holding_period: string | null
          avg_loss: number | null
          avg_trade_return: number | null
          avg_win: number | null
          completed_at: string | null
          created_at: string
          end_date: string
          equity_curve: Json | null
          error_message: string | null
          final_capital: number | null
          id: string
          initial_capital: number
          largest_loss: number | null
          largest_win: number | null
          losing_trades: number | null
          max_drawdown_percent: number | null
          profit_factor: number | null
          sharpe_ratio: number | null
          sortino_ratio: number | null
          start_date: string
          status: string | null
          strategy_id: string | null
          symbol: string
          timeframe: string
          total_return_percent: number | null
          total_trades: number | null
          trades: Json | null
          user_id: string
          win_rate: number | null
          winning_trades: number | null
        }
        Insert: {
          avg_holding_period?: string | null
          avg_loss?: number | null
          avg_trade_return?: number | null
          avg_win?: number | null
          completed_at?: string | null
          created_at?: string
          end_date: string
          equity_curve?: Json | null
          error_message?: string | null
          final_capital?: number | null
          id?: string
          initial_capital?: number
          largest_loss?: number | null
          largest_win?: number | null
          losing_trades?: number | null
          max_drawdown_percent?: number | null
          profit_factor?: number | null
          sharpe_ratio?: number | null
          sortino_ratio?: number | null
          start_date: string
          status?: string | null
          strategy_id?: string | null
          symbol: string
          timeframe?: string
          total_return_percent?: number | null
          total_trades?: number | null
          trades?: Json | null
          user_id: string
          win_rate?: number | null
          winning_trades?: number | null
        }
        Update: {
          avg_holding_period?: string | null
          avg_loss?: number | null
          avg_trade_return?: number | null
          avg_win?: number | null
          completed_at?: string | null
          created_at?: string
          end_date?: string
          equity_curve?: Json | null
          error_message?: string | null
          final_capital?: number | null
          id?: string
          initial_capital?: number
          largest_loss?: number | null
          largest_win?: number | null
          losing_trades?: number | null
          max_drawdown_percent?: number | null
          profit_factor?: number | null
          sharpe_ratio?: number | null
          sortino_ratio?: number | null
          start_date?: string
          status?: string | null
          strategy_id?: string | null
          symbol?: string
          timeframe?: string
          total_return_percent?: number | null
          total_trades?: number | null
          trades?: Json | null
          user_id?: string
          win_rate?: number | null
          winning_trades?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "backtest_results_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "backtest_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      backtest_strategies: {
        Row: {
          created_at: string
          description: string | null
          entry_conditions: Json
          exit_conditions: Json
          id: string
          indicators: Json
          is_active: boolean | null
          name: string
          position_sizing: Json | null
          stop_loss_percent: number | null
          take_profit_percent: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entry_conditions?: Json
          exit_conditions?: Json
          id?: string
          indicators?: Json
          is_active?: boolean | null
          name: string
          position_sizing?: Json | null
          stop_loss_percent?: number | null
          take_profit_percent?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entry_conditions?: Json
          exit_conditions?: Json
          id?: string
          indicators?: Json
          is_active?: boolean | null
          name?: string
          position_sizing?: Json | null
          stop_loss_percent?: number | null
          take_profit_percent?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bot_decisions: {
        Row: {
          analysis_data: Json | null
          confidence: number | null
          created_at: string
          decision_type: string
          executed: boolean | null
          executed_at: string | null
          execution_result: Json | null
          id: string
          reasoning: string | null
          session_id: string
          symbol: string
          user_id: string
        }
        Insert: {
          analysis_data?: Json | null
          confidence?: number | null
          created_at?: string
          decision_type: string
          executed?: boolean | null
          executed_at?: string | null
          execution_result?: Json | null
          id?: string
          reasoning?: string | null
          session_id: string
          symbol: string
          user_id: string
        }
        Update: {
          analysis_data?: Json | null
          confidence?: number | null
          created_at?: string
          decision_type?: string
          executed?: boolean | null
          executed_at?: string | null
          execution_result?: Json | null
          id?: string
          reasoning?: string | null
          session_id?: string
          symbol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_decisions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "bot_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_events: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          kind: string
          message: string
          mode: string
          symbol: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          kind: string
          message: string
          mode: string
          symbol?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          kind?: string
          message?: string
          mode?: string
          symbol?: string | null
          user_id?: string
        }
        Relationships: []
      }
      bot_learning_insights: {
        Row: {
          avg_discipline_score: number | null
          avg_profit_factor: number | null
          avg_slippage: number | null
          created_at: string
          id: string
          insight_date: string
          iv_regime_accuracy: number | null
          key_insights: string[] | null
          risk_observations: string | null
          strategy_adjustments: string | null
          trades_analyzed: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_discipline_score?: number | null
          avg_profit_factor?: number | null
          avg_slippage?: number | null
          created_at?: string
          id?: string
          insight_date?: string
          iv_regime_accuracy?: number | null
          key_insights?: string[] | null
          risk_observations?: string | null
          strategy_adjustments?: string | null
          trades_analyzed?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_discipline_score?: number | null
          avg_profit_factor?: number | null
          avg_slippage?: number | null
          created_at?: string
          id?: string
          insight_date?: string
          iv_regime_accuracy?: number | null
          key_insights?: string[] | null
          risk_observations?: string | null
          strategy_adjustments?: string | null
          trades_analyzed?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bot_performance_log: {
        Row: {
          actual_rr: number | null
          analysis_sources: string[] | null
          chart_analysis_used: boolean | null
          confidence_breakdown: Json | null
          created_at: string
          discipline_score: number | null
          entry_price: number
          execution_quality_score: number | null
          exit_price: number | null
          expected_rr: number | null
          id: string
          iv_rank_entry: number | null
          iv_rank_exit: number | null
          koinonia_signal_used: boolean | null
          live_price_at_entry: number | null
          patterns_detected: string[] | null
          pop_predicted: number | null
          pop_realized: number | null
          profit_factor: number | null
          quantity: number
          regime_classification: string | null
          regime_correct: boolean | null
          screener_match_score: number | null
          sentiment_at_entry: string | null
          slippage: number | null
          strategy: string
          symbol: string
          trade_closed_at: string | null
          trade_id: string | null
          trade_opened_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_rr?: number | null
          analysis_sources?: string[] | null
          chart_analysis_used?: boolean | null
          confidence_breakdown?: Json | null
          created_at?: string
          discipline_score?: number | null
          entry_price: number
          execution_quality_score?: number | null
          exit_price?: number | null
          expected_rr?: number | null
          id?: string
          iv_rank_entry?: number | null
          iv_rank_exit?: number | null
          koinonia_signal_used?: boolean | null
          live_price_at_entry?: number | null
          patterns_detected?: string[] | null
          pop_predicted?: number | null
          pop_realized?: number | null
          profit_factor?: number | null
          quantity: number
          regime_classification?: string | null
          regime_correct?: boolean | null
          screener_match_score?: number | null
          sentiment_at_entry?: string | null
          slippage?: number | null
          strategy: string
          symbol: string
          trade_closed_at?: string | null
          trade_id?: string | null
          trade_opened_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_rr?: number | null
          analysis_sources?: string[] | null
          chart_analysis_used?: boolean | null
          confidence_breakdown?: Json | null
          created_at?: string
          discipline_score?: number | null
          entry_price?: number
          execution_quality_score?: number | null
          exit_price?: number | null
          expected_rr?: number | null
          id?: string
          iv_rank_entry?: number | null
          iv_rank_exit?: number | null
          koinonia_signal_used?: boolean | null
          live_price_at_entry?: number | null
          patterns_detected?: string[] | null
          pop_predicted?: number | null
          pop_realized?: number | null
          profit_factor?: number | null
          quantity?: number
          regime_classification?: string | null
          regime_correct?: boolean | null
          screener_match_score?: number | null
          sentiment_at_entry?: string | null
          slippage?: number | null
          strategy?: string
          symbol?: string
          trade_closed_at?: string | null
          trade_id?: string | null
          trade_opened_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_performance_log_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "auto_trades_log"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_performance_metrics: {
        Row: {
          cash_balance: number | null
          created_at: string
          daily_pnl: number | null
          id: string
          metrics: Json | null
          portfolio_value: number | null
          positions_count: number | null
          session_id: string
          timestamp: string
          total_pnl: number | null
          user_id: string
          win_rate: number | null
        }
        Insert: {
          cash_balance?: number | null
          created_at?: string
          daily_pnl?: number | null
          id?: string
          metrics?: Json | null
          portfolio_value?: number | null
          positions_count?: number | null
          session_id: string
          timestamp?: string
          total_pnl?: number | null
          user_id: string
          win_rate?: number | null
        }
        Update: {
          cash_balance?: number | null
          created_at?: string
          daily_pnl?: number | null
          id?: string
          metrics?: Json | null
          portfolio_value?: number | null
          positions_count?: number | null
          session_id?: string
          timestamp?: string
          total_pnl?: number | null
          user_id?: string
          win_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_performance_metrics_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "bot_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          failed_trades: number | null
          id: string
          mode: string
          started_at: string
          status: string
          successful_trades: number | null
          total_pnl: number | null
          total_trades: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          failed_trades?: number | null
          id?: string
          mode: string
          started_at?: string
          status: string
          successful_trades?: number | null
          total_pnl?: number | null
          total_trades?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          failed_trades?: number | null
          id?: string
          mode?: string
          started_at?: string
          status?: string
          successful_trades?: number | null
          total_pnl?: number | null
          total_trades?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bot_strategy_stats: {
        Row: {
          avg_profit_factor: number | null
          avg_slippage: number | null
          confidence_multiplier: number | null
          created_at: string
          enabled: boolean | null
          id: string
          losing_trades: number | null
          strategy: string
          total_pnl: number | null
          total_trades: number | null
          updated_at: string
          user_id: string
          win_rate: number | null
          winning_trades: number | null
        }
        Insert: {
          avg_profit_factor?: number | null
          avg_slippage?: number | null
          confidence_multiplier?: number | null
          created_at?: string
          enabled?: boolean | null
          id?: string
          losing_trades?: number | null
          strategy: string
          total_pnl?: number | null
          total_trades?: number | null
          updated_at?: string
          user_id: string
          win_rate?: number | null
          winning_trades?: number | null
        }
        Update: {
          avg_profit_factor?: number | null
          avg_slippage?: number | null
          confidence_multiplier?: number | null
          created_at?: string
          enabled?: boolean | null
          id?: string
          losing_trades?: number | null
          strategy?: string
          total_pnl?: number | null
          total_trades?: number | null
          updated_at?: string
          user_id?: string
          win_rate?: number | null
          winning_trades?: number | null
        }
        Relationships: []
      }
      bot_trades: {
        Row: {
          ai_review: Json | null
          broker: string
          closed_at: string | null
          entry_order_id: string | null
          entry_price: number | null
          exit_order_id: string | null
          exit_price: number | null
          exit_reason: string | null
          id: string
          initial_stop: number
          last_checked_at: string | null
          mode: string
          note: string | null
          opened_at: string
          pnl: number | null
          quantity: number
          r_multiple: number | null
          signal: Json | null
          signal_price: number
          status: string
          stop_order_id: string | null
          stop_price: number
          symbol: string
          target_price: number
          trade_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_review?: Json | null
          broker: string
          closed_at?: string | null
          entry_order_id?: string | null
          entry_price?: number | null
          exit_order_id?: string | null
          exit_price?: number | null
          exit_reason?: string | null
          id?: string
          initial_stop: number
          last_checked_at?: string | null
          mode: string
          note?: string | null
          opened_at?: string
          pnl?: number | null
          quantity: number
          r_multiple?: number | null
          signal?: Json | null
          signal_price: number
          status: string
          stop_order_id?: string | null
          stop_price: number
          symbol: string
          target_price: number
          trade_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_review?: Json | null
          broker?: string
          closed_at?: string | null
          entry_order_id?: string | null
          entry_price?: number | null
          exit_order_id?: string | null
          exit_price?: number | null
          exit_reason?: string | null
          id?: string
          initial_stop?: number
          last_checked_at?: string | null
          mode?: string
          note?: string | null
          opened_at?: string
          pnl?: number | null
          quantity?: number
          r_multiple?: number | null
          signal?: Json | null
          signal_price?: number
          status?: string
          stop_order_id?: string | null
          stop_price?: number
          symbol?: string
          target_price?: number
          trade_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chart_annotations: {
        Row: {
          annotation_type: string
          chart_timestamp: number | null
          color: string
          created_at: string
          id: string
          is_shared: boolean | null
          price: number
          symbol: string
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          annotation_type?: string
          chart_timestamp?: number | null
          color?: string
          created_at?: string
          id?: string
          is_shared?: boolean | null
          price: number
          symbol: string
          text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          annotation_type?: string
          chart_timestamp?: number | null
          color?: string
          created_at?: string
          id?: string
          is_shared?: boolean | null
          price?: number
          symbol?: string
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contact_submissions: {
        Row: {
          created_at: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          message: string
          phone: string | null
          trading_experience: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          first_name: string
          id?: string
          last_name: string
          message: string
          phone?: string | null
          trading_experience?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          message?: string
          phone?: string | null
          trading_experience?: string | null
        }
        Relationships: []
      }
      course_certificates: {
        Row: {
          certificate_number: string
          course_id: string
          created_at: string
          id: string
          issued_at: string
          user_id: string
        }
        Insert: {
          certificate_number: string
          course_id: string
          created_at?: string
          id?: string
          issued_at?: string
          user_id: string
        }
        Update: {
          certificate_number?: string
          course_id?: string
          created_at?: string
          id?: string
          issued_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_lessons: {
        Row: {
          content_markdown: string | null
          created_at: string
          description: string | null
          duration: string | null
          id: string
          module_id: string
          order_index: number | null
          quiz_questions: Json | null
          status: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          content_markdown?: string | null
          created_at?: string
          description?: string | null
          duration?: string | null
          id?: string
          module_id: string
          order_index?: number | null
          quiz_questions?: Json | null
          status?: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          content_markdown?: string | null
          created_at?: string
          description?: string | null
          duration?: string | null
          id?: string
          module_id?: string
          order_index?: number | null
          quiz_questions?: Json | null
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      course_modules: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          id: string
          order_index: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string
          description: string | null
          difficulty_level: string
          estimated_duration: string | null
          id: string
          order_index: number | null
          status: string
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          difficulty_level?: string
          estimated_duration?: string | null
          id?: string
          order_index?: number | null
          status?: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          difficulty_level?: string
          estimated_duration?: string | null
          id?: string
          order_index?: number | null
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      day_trades_log: {
        Row: {
          account_value: number
          broker: string
          buy_timestamp: string
          created_at: string | null
          id: string
          is_margin_account: boolean
          sell_timestamp: string
          symbol: string
          user_id: string
        }
        Insert: {
          account_value: number
          broker?: string
          buy_timestamp: string
          created_at?: string | null
          id?: string
          is_margin_account?: boolean
          sell_timestamp: string
          symbol: string
          user_id: string
        }
        Update: {
          account_value?: number
          broker?: string
          buy_timestamp?: string
          created_at?: string | null
          id?: string
          is_margin_account?: boolean
          sell_timestamp?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      family_members: {
        Row: {
          created_at: string
          id: string
          member_email: string
          member_user_id: string | null
          primary_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_email: string
          member_user_id?: string | null
          primary_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          member_email?: string
          member_user_id?: string | null
          primary_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      mcp_connections: {
        Row: {
          access_token_enc: string | null
          authorization_endpoint: string | null
          client_id: string | null
          client_secret_enc: string | null
          created_at: string
          id: string
          last_error: string | null
          metadata: Json | null
          oauth_state: string | null
          pkce_verifier_enc: string | null
          provider: string
          redirect_uri: string | null
          refresh_token_enc: string | null
          registration_endpoint: string | null
          scope_mode: string
          server_url: string
          state: string
          token_endpoint: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_enc?: string | null
          authorization_endpoint?: string | null
          client_id?: string | null
          client_secret_enc?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          metadata?: Json | null
          oauth_state?: string | null
          pkce_verifier_enc?: string | null
          provider: string
          redirect_uri?: string | null
          refresh_token_enc?: string | null
          registration_endpoint?: string | null
          scope_mode?: string
          server_url: string
          state?: string
          token_endpoint?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_enc?: string | null
          authorization_endpoint?: string | null
          client_id?: string | null
          client_secret_enc?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          metadata?: Json | null
          oauth_state?: string | null
          pkce_verifier_enc?: string | null
          provider?: string
          redirect_uri?: string | null
          refresh_token_enc?: string | null
          registration_endpoint?: string | null
          scope_mode?: string
          server_url?: string
          state?: string
          token_endpoint?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      options_predictions: {
        Row: {
          atr: number | null
          baseline: number | null
          chance: number | null
          contract: Json | null
          created_at: string
          deadline: string
          direction: string
          entry_price: number
          evidence: Json | null
          exit_price: number | null
          id: string
          mode: string
          outcome: string | null
          reason: string | null
          resolved_at: string | null
          signal_at: string
          stop_price: number
          strength: string | null
          symbol: string
          target_price: number
          user_id: string
        }
        Insert: {
          atr?: number | null
          baseline?: number | null
          chance?: number | null
          contract?: Json | null
          created_at?: string
          deadline: string
          direction: string
          entry_price: number
          evidence?: Json | null
          exit_price?: number | null
          id?: string
          mode: string
          outcome?: string | null
          reason?: string | null
          resolved_at?: string | null
          signal_at: string
          stop_price: number
          strength?: string | null
          symbol: string
          target_price: number
          user_id: string
        }
        Update: {
          atr?: number | null
          baseline?: number | null
          chance?: number | null
          contract?: Json | null
          created_at?: string
          deadline?: string
          direction?: string
          entry_price?: number
          evidence?: Json | null
          exit_price?: number | null
          id?: string
          mode?: string
          outcome?: string | null
          reason?: string | null
          resolved_at?: string | null
          signal_at?: string
          stop_price?: number
          strength?: string | null
          symbol?: string
          target_price?: number
          user_id?: string
        }
        Relationships: []
      }
      paper_order_events: {
        Row: {
          created_at: string
          event_type: string
          fill_price: number | null
          fill_quantity: number | null
          id: string
          metadata: Json | null
          new_status: string
          oco_group: string | null
          order_id: string
          parent_order_id: string | null
          previous_status: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          fill_price?: number | null
          fill_quantity?: number | null
          id?: string
          metadata?: Json | null
          new_status: string
          oco_group?: string | null
          order_id: string
          parent_order_id?: string | null
          previous_status?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          fill_price?: number | null
          fill_quantity?: number | null
          id?: string
          metadata?: Json | null
          new_status?: string
          oco_group?: string | null
          order_id?: string
          parent_order_id?: string | null
          previous_status?: string | null
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      paper_orders: {
        Row: {
          account_id: string
          contract_key: string | null
          created_at: string
          filled_at: string | null
          filled_price: number | null
          id: string
          limit_price: number | null
          multiplier: number
          notes: string | null
          oco_group: string | null
          order_type: string
          parent_order_id: string | null
          quantity: number
          side: string
          status: string
          stop_price: number | null
          stop_triggered: boolean
          symbol: string
          time_in_force: string
          trail_amount: number | null
          trail_percent: number | null
          updated_at: string
          user_id: string
          watermark: number | null
        }
        Insert: {
          account_id: string
          contract_key?: string | null
          created_at?: string
          filled_at?: string | null
          filled_price?: number | null
          id?: string
          limit_price?: number | null
          multiplier?: number
          notes?: string | null
          oco_group?: string | null
          order_type: string
          parent_order_id?: string | null
          quantity: number
          side: string
          status?: string
          stop_price?: number | null
          stop_triggered?: boolean
          symbol: string
          time_in_force?: string
          trail_amount?: number | null
          trail_percent?: number | null
          updated_at?: string
          user_id: string
          watermark?: number | null
        }
        Update: {
          account_id?: string
          contract_key?: string | null
          created_at?: string
          filled_at?: string | null
          filled_price?: number | null
          id?: string
          limit_price?: number | null
          multiplier?: number
          notes?: string | null
          oco_group?: string | null
          order_type?: string
          parent_order_id?: string | null
          quantity?: number
          side?: string
          status?: string
          stop_price?: number | null
          stop_triggered?: boolean
          symbol?: string
          time_in_force?: string
          trail_amount?: number | null
          trail_percent?: number | null
          updated_at?: string
          user_id?: string
          watermark?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "paper_orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "paper_trading_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_positions: {
        Row: {
          account_id: string
          avg_cost: number
          contract_key: string | null
          id: string
          multiplier: number
          opened_at: string
          quantity: number
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          avg_cost: number
          contract_key?: string | null
          id?: string
          multiplier?: number
          opened_at?: string
          quantity: number
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          avg_cost?: number
          contract_key?: string | null
          id?: string
          multiplier?: number
          opened_at?: string
          quantity?: number
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_positions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "paper_trading_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_trades: {
        Row: {
          account_id: string
          action: string
          created_at: string
          executed_at: string
          id: string
          notes: string | null
          price: number
          profit_loss: number | null
          quantity: number
          symbol: string
          total_value: number
          user_id: string
        }
        Insert: {
          account_id: string
          action: string
          created_at?: string
          executed_at?: string
          id?: string
          notes?: string | null
          price: number
          profit_loss?: number | null
          quantity: number
          symbol: string
          total_value: number
          user_id: string
        }
        Update: {
          account_id?: string
          action?: string
          created_at?: string
          executed_at?: string
          id?: string
          notes?: string | null
          price?: number
          profit_loss?: number | null
          quantity?: number
          symbol?: string
          total_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_trades_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "paper_trading_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_trading_accounts: {
        Row: {
          balance: number
          created_at: string
          id: string
          realized_pnl: number
          reset_count: number
          starting_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          realized_pnl?: number
          reset_count?: number
          starting_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          realized_pnl?: number
          reset_count?: number
          starting_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      penny_stock_predictions: {
        Row: {
          actual_outcome: string | null
          breakout_probability: number
          catalyst_headline: string | null
          catalyst_type: string | null
          confidence_rank: string | null
          created_at: string | null
          float_shares: number | null
          id: string
          key_factors: Json | null
          market_cap: number | null
          max_gain_5d: number | null
          momentum_5d: number | null
          near_52w_high: boolean | null
          news_sentiment_score: number | null
          pattern_detected: string | null
          predicted_direction: string | null
          prediction_date: string
          price_after_5d: number | null
          price_at_prediction: number | null
          reasoning: string | null
          relative_volume: number | null
          risk_flags: Json | null
          rsi: number | null
          short_interest: number | null
          sma_20: number | null
          symbol: string
          updated_at: string | null
          user_id: string
          volume_at_prediction: number | null
          vwap: number | null
          was_accurate: boolean | null
        }
        Insert: {
          actual_outcome?: string | null
          breakout_probability: number
          catalyst_headline?: string | null
          catalyst_type?: string | null
          confidence_rank?: string | null
          created_at?: string | null
          float_shares?: number | null
          id?: string
          key_factors?: Json | null
          market_cap?: number | null
          max_gain_5d?: number | null
          momentum_5d?: number | null
          near_52w_high?: boolean | null
          news_sentiment_score?: number | null
          pattern_detected?: string | null
          predicted_direction?: string | null
          prediction_date?: string
          price_after_5d?: number | null
          price_at_prediction?: number | null
          reasoning?: string | null
          relative_volume?: number | null
          risk_flags?: Json | null
          rsi?: number | null
          short_interest?: number | null
          sma_20?: number | null
          symbol: string
          updated_at?: string | null
          user_id: string
          volume_at_prediction?: number | null
          vwap?: number | null
          was_accurate?: boolean | null
        }
        Update: {
          actual_outcome?: string | null
          breakout_probability?: number
          catalyst_headline?: string | null
          catalyst_type?: string | null
          confidence_rank?: string | null
          created_at?: string | null
          float_shares?: number | null
          id?: string
          key_factors?: Json | null
          market_cap?: number | null
          max_gain_5d?: number | null
          momentum_5d?: number | null
          near_52w_high?: boolean | null
          news_sentiment_score?: number | null
          pattern_detected?: string | null
          predicted_direction?: string | null
          prediction_date?: string
          price_after_5d?: number | null
          price_at_prediction?: number | null
          reasoning?: string | null
          relative_volume?: number | null
          risk_flags?: Json | null
          rsi?: number | null
          short_interest?: number | null
          sma_20?: number | null
          symbol?: string
          updated_at?: string | null
          user_id?: string
          volume_at_prediction?: number | null
          vwap?: number | null
          was_accurate?: boolean | null
        }
        Relationships: []
      }
      penny_stock_watchlist: {
        Row: {
          added_at: string | null
          alert_enabled: boolean | null
          id: string
          notes: string | null
          symbol: string
          user_id: string
        }
        Insert: {
          added_at?: string | null
          alert_enabled?: boolean | null
          id?: string
          notes?: string | null
          symbol: string
          user_id: string
        }
        Update: {
          added_at?: string | null
          alert_enabled?: boolean | null
          id?: string
          notes?: string | null
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      phroureo_exit_strategies: {
        Row: {
          allow_after_hours: boolean
          contract_key: string | null
          created_at: string
          current_stop_price: number | null
          enable_trailing: boolean
          enabled: boolean
          entry_price: number
          id: string
          last_update_at: string | null
          max_order_updates_per_minute: number
          multiplier: number
          paper_order_id: string | null
          position_id: string | null
          position_type: string
          profit_trigger_type: string
          profit_trigger_unit: string
          profit_trigger_value: number
          quantity: number
          reference_price: number | null
          side: string
          slippage_buffer: number | null
          state: string
          stop_set_lock: boolean
          stop_set_mode: string
          stop_set_rounding: string
          stop_set_value: number | null
          strategy_name: string
          symbol: string
          trail_never_loosen: boolean
          trail_reference: string | null
          trail_start_delay: number | null
          trail_step_type: string | null
          trail_step_value: number | null
          trailing_amount: number | null
          trailing_type: string | null
          trigger_once: boolean
          triggered_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_after_hours?: boolean
          contract_key?: string | null
          created_at?: string
          current_stop_price?: number | null
          enable_trailing?: boolean
          enabled?: boolean
          entry_price: number
          id?: string
          last_update_at?: string | null
          max_order_updates_per_minute?: number
          multiplier?: number
          paper_order_id?: string | null
          position_id?: string | null
          position_type?: string
          profit_trigger_type?: string
          profit_trigger_unit?: string
          profit_trigger_value?: number
          quantity?: number
          reference_price?: number | null
          side: string
          slippage_buffer?: number | null
          state?: string
          stop_set_lock?: boolean
          stop_set_mode?: string
          stop_set_rounding?: string
          stop_set_value?: number | null
          strategy_name?: string
          symbol: string
          trail_never_loosen?: boolean
          trail_reference?: string | null
          trail_start_delay?: number | null
          trail_step_type?: string | null
          trail_step_value?: number | null
          trailing_amount?: number | null
          trailing_type?: string | null
          trigger_once?: boolean
          triggered_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_after_hours?: boolean
          contract_key?: string | null
          created_at?: string
          current_stop_price?: number | null
          enable_trailing?: boolean
          enabled?: boolean
          entry_price?: number
          id?: string
          last_update_at?: string | null
          max_order_updates_per_minute?: number
          multiplier?: number
          paper_order_id?: string | null
          position_id?: string | null
          position_type?: string
          profit_trigger_type?: string
          profit_trigger_unit?: string
          profit_trigger_value?: number
          quantity?: number
          reference_price?: number | null
          side?: string
          slippage_buffer?: number | null
          state?: string
          stop_set_lock?: boolean
          stop_set_mode?: string
          stop_set_rounding?: string
          stop_set_value?: number | null
          strategy_name?: string
          symbol?: string
          trail_never_loosen?: boolean
          trail_reference?: string | null
          trail_start_delay?: number | null
          trail_step_type?: string | null
          trail_step_value?: number | null
          trailing_amount?: number | null
          trailing_type?: string | null
          trigger_once?: boolean
          triggered_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phroureo_exit_strategies_paper_order_id_fkey"
            columns: ["paper_order_id"]
            isOneToOne: false
            referencedRelation: "paper_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      phroureo_strategy_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          new_state: string | null
          new_stop: number | null
          previous_state: string | null
          previous_stop: number | null
          reason: string | null
          strategy_id: string
          trigger_price: number | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          new_state?: string | null
          new_stop?: number | null
          previous_state?: string | null
          previous_stop?: number | null
          reason?: string | null
          strategy_id: string
          trigger_price?: number | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          new_state?: string | null
          new_stop?: number | null
          previous_state?: string | null
          previous_stop?: number | null
          reason?: string | null
          strategy_id?: string
          trigger_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "phroureo_strategy_events_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "phroureo_exit_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      pocketoption_candles: {
        Row: {
          close: number
          created_at: string
          direction: string
          high: number
          id: string
          low: number
          open: number
          pair: string
          timeframe: string
          timestamp: string
          user_id: string
          volume: number | null
        }
        Insert: {
          close: number
          created_at?: string
          direction: string
          high: number
          id?: string
          low: number
          open: number
          pair: string
          timeframe?: string
          timestamp: string
          user_id: string
          volume?: number | null
        }
        Update: {
          close?: number
          created_at?: string
          direction?: string
          high?: number
          id?: string
          low?: number
          open?: number
          pair?: string
          timeframe?: string
          timestamp?: string
          user_id?: string
          volume?: number | null
        }
        Relationships: []
      }
      pocketoption_patterns: {
        Row: {
          accuracy_rate: number
          asset: string | null
          candle_time: string | null
          details: Json | null
          entry_price: number | null
          exit_price: number | null
          expiry_candles: number
          outcome: string | null
          resolved_at: string | null
          sample_size: number | null
          timeframe: string
          win_rate: number | null
          confidence: number
          created_at: string
          expires_at: string
          id: string
          pair: string
          pattern_type: string
          predicted_at: string
          predicted_direction: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy_rate?: number
          asset?: string | null
          candle_time?: string | null
          details?: Json | null
          entry_price?: number | null
          exit_price?: number | null
          expiry_candles?: number
          outcome?: string | null
          resolved_at?: string | null
          sample_size?: number | null
          timeframe?: string
          win_rate?: number | null
          confidence: number
          created_at?: string
          expires_at: string
          id?: string
          pair: string
          pattern_type: string
          predicted_at?: string
          predicted_direction: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy_rate?: number
          asset?: string | null
          candle_time?: string | null
          details?: Json | null
          entry_price?: number | null
          exit_price?: number | null
          expiry_candles?: number
          outcome?: string | null
          resolved_at?: string | null
          sample_size?: number | null
          timeframe?: string
          win_rate?: number | null
          confidence?: number
          created_at?: string
          expires_at?: string
          id?: string
          pair?: string
          pattern_type?: string
          predicted_at?: string
          predicted_direction?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pocketoption_predictions: {
        Row: {
          candle_time: string | null
          evidence: Json | null
          expiry_candles: number
          made_call: boolean
          p_up: number | null
          timeframe: string
          actual_direction: string | null
          confidence: number
          created_at: string
          id: string
          pair: string
          predicted_at: string
          predicted_direction: string
          prediction_method: string
          sequence_used: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
          was_correct: boolean | null
        }
        Insert: {
          candle_time?: string | null
          evidence?: Json | null
          expiry_candles?: number
          made_call?: boolean
          p_up?: number | null
          timeframe?: string
          actual_direction?: string | null
          confidence?: number
          created_at?: string
          id?: string
          pair: string
          predicted_at?: string
          predicted_direction: string
          prediction_method: string
          sequence_used?: string | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
          was_correct?: boolean | null
        }
        Update: {
          candle_time?: string | null
          evidence?: Json | null
          expiry_candles?: number
          made_call?: boolean
          p_up?: number | null
          timeframe?: string
          actual_direction?: string | null
          confidence?: number
          created_at?: string
          id?: string
          pair?: string
          predicted_at?: string
          predicted_direction?: string
          prediction_method?: string
          sequence_used?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
          was_correct?: boolean | null
        }
        Relationships: []
      }
      pocketoption_trades: {
        Row: {
          amount: number
          closed_at: string | null
          created_at: string
          direction: string
          duration: number
          entry_price: number
          executed_at: string
          exit_price: number | null
          id: string
          pair: string
          pattern_id: string | null
          profit_loss: number | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          closed_at?: string | null
          created_at?: string
          direction: string
          duration: number
          entry_price: number
          executed_at?: string
          exit_price?: number | null
          id?: string
          pair: string
          pattern_id?: string | null
          profit_loss?: number | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          closed_at?: string | null
          created_at?: string
          direction?: string
          duration?: number
          entry_price?: number
          executed_at?: string
          exit_price?: number | null
          id?: string
          pair?: string
          pattern_id?: string | null
          profit_loss?: number | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pocketoption_trades_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "pocketoption_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      pocketoption_watch: {
        Row: {
          asset: string
          created_at: string
          enabled: boolean
          last_candle_at: string | null
          last_count: number | null
          last_error: string | null
          last_run_at: string | null
          user_id: string
        }
        Insert: {
          asset: string
          created_at?: string
          enabled?: boolean
          last_candle_at?: string | null
          last_count?: number | null
          last_error?: string | null
          last_run_at?: string | null
          user_id: string
        }
        Update: {
          asset?: string
          created_at?: string
          enabled?: boolean
          last_candle_at?: string | null
          last_count?: number | null
          last_error?: string | null
          last_run_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      podcast_chat_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          podcast_id: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          podcast_id: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          podcast_id?: string
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "podcast_chat_messages_podcast_id_fkey"
            columns: ["podcast_id"]
            isOneToOne: false
            referencedRelation: "podcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      podcasts: {
        Row: {
          audio_url: string
          created_at: string | null
          description: string | null
          duration: string | null
          episode_number: number
          episode_type: string
          id: string
          is_live_now: boolean | null
          publish_date: string | null
          show_notes: string | null
          status: string
          title: string
          updated_at: string | null
          youtube_live_url: string | null
        }
        Insert: {
          audio_url: string
          created_at?: string | null
          description?: string | null
          duration?: string | null
          episode_number: number
          episode_type?: string
          id?: string
          is_live_now?: boolean | null
          publish_date?: string | null
          show_notes?: string | null
          status?: string
          title: string
          updated_at?: string | null
          youtube_live_url?: string | null
        }
        Update: {
          audio_url?: string
          created_at?: string | null
          description?: string | null
          duration?: string | null
          episode_number?: number
          episode_type?: string
          id?: string
          is_live_now?: boolean | null
          publish_date?: string | null
          show_notes?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          youtube_live_url?: string | null
        }
        Relationships: []
      }
      price_alerts: {
        Row: {
          alert_type: string
          condition: Json | null
          cooldown_minutes: number
          created_at: string
          current_value: number | null
          frequency: string
          id: string
          is_active: boolean | null
          is_triggered: boolean | null
          last_checked_at: string | null
          last_price: number | null
          notes: string | null
          notification_sent: boolean | null
          notify_email: boolean
          symbol: string
          target_value: number
          trigger_count: number
          trigger_message: string | null
          triggered_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_type: string
          condition?: Json | null
          cooldown_minutes?: number
          created_at?: string
          current_value?: number | null
          frequency?: string
          id?: string
          is_active?: boolean | null
          is_triggered?: boolean | null
          last_checked_at?: string | null
          last_price?: number | null
          notes?: string | null
          notification_sent?: boolean | null
          notify_email?: boolean
          symbol: string
          target_value: number
          trigger_count?: number
          trigger_message?: string | null
          triggered_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_type?: string
          condition?: Json | null
          cooldown_minutes?: number
          created_at?: string
          current_value?: number | null
          frequency?: string
          id?: string
          is_active?: boolean | null
          is_triggered?: boolean | null
          last_checked_at?: string | null
          last_price?: number | null
          notes?: string | null
          notification_sent?: boolean | null
          notify_email?: boolean
          symbol?: string
          target_value?: number
          trigger_count?: number
          trigger_message?: string | null
          triggered_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string
          country_code: string | null
          created_at: string | null
          date_of_birth: string | null
          full_name: string | null
          id: string
          id_verification_status: string | null
          id_verified_at: string | null
          stripe_verification_session_id: string | null
          stripe_verified_at: string | null
          theme_preference: string | null
          trading_experience: string | null
          updated_at: string | null
          user_id: string
          verification_provider: string | null
          verification_session_id: string | null
        }
        Insert: {
          account_status?: string
          country_code?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          full_name?: string | null
          id?: string
          id_verification_status?: string | null
          id_verified_at?: string | null
          stripe_verification_session_id?: string | null
          stripe_verified_at?: string | null
          theme_preference?: string | null
          trading_experience?: string | null
          updated_at?: string | null
          user_id: string
          verification_provider?: string | null
          verification_session_id?: string | null
        }
        Update: {
          account_status?: string
          country_code?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          full_name?: string | null
          id?: string
          id_verification_status?: string | null
          id_verified_at?: string | null
          stripe_verification_session_id?: string | null
          stripe_verified_at?: string | null
          theme_preference?: string | null
          trading_experience?: string | null
          updated_at?: string | null
          user_id?: string
          verification_provider?: string | null
          verification_session_id?: string | null
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          tier: string
          uses_remaining: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          tier: string
          uses_remaining?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          tier?: string
          uses_remaining?: number | null
        }
        Relationships: []
      }
      screener_presets: {
        Row: {
          conditions: Json
          created_at: string
          description: string | null
          id: string
          is_default: boolean | null
          last_run_at: string | null
          name: string
          results_count: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          last_run_at?: string | null
          name: string
          results_count?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          last_run_at?: string | null
          name?: string
          results_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      screener_results: {
        Row: {
          change_percent: number | null
          created_at: string
          id: string
          match_score: number | null
          matched_conditions: Json | null
          preset_id: string | null
          price: number | null
          symbol: string
          user_id: string
          volume: number | null
        }
        Insert: {
          change_percent?: number | null
          created_at?: string
          id?: string
          match_score?: number | null
          matched_conditions?: Json | null
          preset_id?: string | null
          price?: number | null
          symbol: string
          user_id: string
          volume?: number | null
        }
        Update: {
          change_percent?: number | null
          created_at?: string
          id?: string
          match_score?: number | null
          matched_conditions?: Json | null
          preset_id?: string | null
          price?: number | null
          symbol?: string
          user_id?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "screener_results_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "screener_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      service_status_history: {
        Row: {
          checked_at: string
          checked_by: string | null
          id: string
          latency: number | null
          service_name: string
          status: string
        }
        Insert: {
          checked_at?: string
          checked_by?: string | null
          id?: string
          latency?: number | null
          service_name: string
          status?: string
        }
        Update: {
          checked_at?: string
          checked_by?: string | null
          id?: string
          latency?: number | null
          service_name?: string
          status?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          plan_name: string
          start_date: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          plan_name: string
          start_date?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          plan_name?: string
          start_date?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trade_reviews: {
        Row: {
          created_at: string | null
          id: string
          rating: number | null
          trade_id: string | null
          trade_type: string
          updated_at: string | null
          user_id: string
          what_went_right: string | null
          what_went_wrong: string | null
          would_take_again: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          rating?: number | null
          trade_id?: string | null
          trade_type: string
          updated_at?: string | null
          user_id: string
          what_went_right?: string | null
          what_went_wrong?: string | null
          would_take_again?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: string
          rating?: number | null
          trade_id?: string | null
          trade_type?: string
          updated_at?: string | null
          user_id?: string
          what_went_right?: string | null
          what_went_wrong?: string | null
          would_take_again?: boolean | null
        }
        Relationships: []
      }
      trading_journal: {
        Row: {
          ai_analysis: string | null
          ai_suggestions: string[] | null
          analyzed_at: string | null
          bot_trade_id: string | null
          chart_analysis: string | null
          content: string
          created_at: string
          emotions: string[] | null
          entry_date: string
          entry_type: string
          id: string
          image_urls: string[] | null
          symbol: string | null
          tags: string[] | null
          trade_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_analysis?: string | null
          ai_suggestions?: string[] | null
          analyzed_at?: string | null
          bot_trade_id?: string | null
          chart_analysis?: string | null
          content: string
          created_at?: string
          emotions?: string[] | null
          entry_date?: string
          entry_type: string
          id?: string
          image_urls?: string[] | null
          symbol?: string | null
          tags?: string[] | null
          trade_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_analysis?: string | null
          ai_suggestions?: string[] | null
          analyzed_at?: string | null
          bot_trade_id?: string | null
          chart_analysis?: string | null
          content?: string
          created_at?: string
          emotions?: string[] | null
          entry_date?: string
          entry_type?: string
          id?: string
          image_urls?: string[] | null
          symbol?: string | null
          tags?: string[] | null
          trade_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trading_journal_bot_trade_id_fkey"
            columns: ["bot_trade_id"]
            isOneToOne: false
            referencedRelation: "bot_trades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trading_journal_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "paper_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_sessions: {
        Row: {
          created_at: string | null
          ended_at: string | null
          id: string
          session_pnl: number | null
          started_at: string | null
          trades_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          session_pnl?: number | null
          started_at?: string | null
          trades_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          session_pnl?: number | null
          started_at?: string | null
          trades_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      trading_signals: {
        Row: {
          ai_analysis: string | null
          confidence_score: number | null
          created_at: string | null
          entry_price: number | null
          expires_at: string | null
          id: string
          signal_type: string
          stop_loss: number | null
          symbol: string
          target_price: number | null
        }
        Insert: {
          ai_analysis?: string | null
          confidence_score?: number | null
          created_at?: string | null
          entry_price?: number | null
          expires_at?: string | null
          id?: string
          signal_type: string
          stop_loss?: number | null
          symbol: string
          target_price?: number | null
        }
        Update: {
          ai_analysis?: string | null
          confidence_score?: number | null
          created_at?: string | null
          entry_price?: number | null
          expires_at?: string | null
          id?: string
          signal_type?: string
          stop_loss?: number | null
          symbol?: string
          target_price?: number | null
        }
        Relationships: []
      }
      usage_tracking: {
        Row: {
          count: number | null
          created_at: string | null
          feature: string
          id: string
          period_end: string | null
          period_start: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          count?: number | null
          created_at?: string | null
          feature: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          count?: number | null
          created_at?: string | null
          feature?: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_api_credentials: {
        Row: {
          account_type: string | null
          account_value: number | null
          alpaca_api_key: string | null
          alpaca_paper_mode: boolean | null
          alpaca_secret_key: string | null
          broker_type: string | null
          created_at: string
          etrade_access_secret: string | null
          etrade_access_token: string | null
          etrade_consumer_key: string | null
          etrade_consumer_secret: string | null
          ib_access_token: string | null
          ib_account_id: string | null
          id: string
          pocketoption_api_key: string | null
          pocketoption_ssid: string | null
          schwab_access_token: string | null
          schwab_client_id: string | null
          schwab_client_secret: string | null
          schwab_refresh_issued_at: string | null
          schwab_refresh_token: string | null
          schwab_token_expires_at: string | null
          td_client_id: string | null
          td_client_secret: string | null
          td_refresh_token: string | null
          trading_mode: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type?: string | null
          account_value?: number | null
          alpaca_api_key?: string | null
          alpaca_paper_mode?: boolean | null
          alpaca_secret_key?: string | null
          broker_type?: string | null
          created_at?: string
          etrade_access_secret?: string | null
          etrade_access_token?: string | null
          etrade_consumer_key?: string | null
          etrade_consumer_secret?: string | null
          ib_access_token?: string | null
          ib_account_id?: string | null
          id?: string
          pocketoption_api_key?: string | null
          pocketoption_ssid?: string | null
          schwab_access_token?: string | null
          schwab_client_id?: string | null
          schwab_client_secret?: string | null
          schwab_refresh_issued_at?: string | null
          schwab_refresh_token?: string | null
          schwab_token_expires_at?: string | null
          td_client_id?: string | null
          td_client_secret?: string | null
          td_refresh_token?: string | null
          trading_mode?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string | null
          account_value?: number | null
          alpaca_api_key?: string | null
          alpaca_paper_mode?: boolean | null
          alpaca_secret_key?: string | null
          broker_type?: string | null
          created_at?: string
          etrade_access_secret?: string | null
          etrade_access_token?: string | null
          etrade_consumer_key?: string | null
          etrade_consumer_secret?: string | null
          ib_access_token?: string | null
          ib_account_id?: string | null
          id?: string
          pocketoption_api_key?: string | null
          pocketoption_ssid?: string | null
          schwab_access_token?: string | null
          schwab_client_id?: string | null
          schwab_client_secret?: string | null
          schwab_refresh_issued_at?: string | null
          schwab_refresh_token?: string | null
          schwab_token_expires_at?: string | null
          td_client_id?: string | null
          td_client_secret?: string | null
          td_refresh_token?: string | null
          trading_mode?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_chart_state: {
        Row: {
          key: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          user_id: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: []
      }
      user_course_progress: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          course_id: string
          created_at: string
          id: string
          lesson_id: string
          quiz_score: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          course_id: string
          created_at?: string
          id?: string
          lesson_id: string
          quiz_score?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          course_id?: string
          created_at?: string
          id?: string
          lesson_id?: string
          quiz_score?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_course_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_course_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_exit_preferences: {
        Row: {
          created_at: string | null
          default_phroureo_preset: string | null
          default_stop_loss_enabled: boolean | null
          default_stop_loss_type: string | null
          default_stop_loss_value: number | null
          default_trailing_enabled: boolean | null
          default_trailing_type: string | null
          default_trailing_value: number | null
          id: string
          saved_exit_presets: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          default_phroureo_preset?: string | null
          default_stop_loss_enabled?: boolean | null
          default_stop_loss_type?: string | null
          default_stop_loss_value?: number | null
          default_trailing_enabled?: boolean | null
          default_trailing_type?: string | null
          default_trailing_value?: number | null
          id?: string
          saved_exit_presets?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          default_phroureo_preset?: string | null
          default_stop_loss_enabled?: boolean | null
          default_stop_loss_type?: string | null
          default_stop_loss_value?: number | null
          default_trailing_enabled?: boolean | null
          default_trailing_type?: string | null
          default_trailing_value?: number | null
          id?: string
          saved_exit_presets?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_watchlist: {
        Row: {
          added_at: string | null
          id: string
          symbol: string
          user_id: string
        }
        Insert: {
          added_at?: string | null
          id?: string
          symbol: string
          user_id: string
        }
        Update: {
          added_at?: string | null
          id?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      videos: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          duration: string | null
          id: string
          status: string
          thumbnail_url: string | null
          title: string
          updated_at: string | null
          video_url: string
          view_count: number | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          duration?: string | null
          id?: string
          status?: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
          video_url: string
          view_count?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          duration?: string | null
          id?: string
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
          video_url?: string
          view_count?: number | null
        }
        Relationships: []
      }
      wlsm_backtest_results: {
        Row: {
          created_at: string
          end_date: string
          id: string
          results_json: Json
          start_date: string
          symbol: string
          test_variant: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          results_json?: Json
          start_date: string
          symbol?: string
          test_variant?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          results_json?: Json
          start_date?: string
          symbol?: string
          test_variant?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      count_recent_day_trades: {
        Args: { _current_date?: string; _user_id: string }
        Returns: number
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_family_enterprise_access: {
        Args: { _user_id: string }
        Returns: boolean
      }
      has_premium_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "free_user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "free_user"],
    },
  },
} as const
