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
          allowed_symbols: string[] | null
          created_at: string | null
          enabled: boolean | null
          id: string
          max_daily_trades: number | null
          max_position_size: number | null
          risk_tolerance: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          allowed_symbols?: string[] | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          max_daily_trades?: number | null
          max_position_size?: number | null
          risk_tolerance?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          allowed_symbols?: string[] | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          max_daily_trades?: number | null
          max_position_size?: number | null
          risk_tolerance?: string | null
          updated_at?: string | null
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
          created_at: string
          discipline_score: number | null
          entry_price: number
          execution_quality_score: number | null
          exit_price: number | null
          expected_rr: number | null
          id: string
          iv_rank_entry: number | null
          iv_rank_exit: number | null
          pop_predicted: number | null
          pop_realized: number | null
          profit_factor: number | null
          quantity: number
          regime_classification: string | null
          regime_correct: boolean | null
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
          created_at?: string
          discipline_score?: number | null
          entry_price: number
          execution_quality_score?: number | null
          exit_price?: number | null
          expected_rr?: number | null
          id?: string
          iv_rank_entry?: number | null
          iv_rank_exit?: number | null
          pop_predicted?: number | null
          pop_realized?: number | null
          profit_factor?: number | null
          quantity: number
          regime_classification?: string | null
          regime_correct?: boolean | null
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
          created_at?: string
          discipline_score?: number | null
          entry_price?: number
          execution_quality_score?: number | null
          exit_price?: number | null
          expected_rr?: number | null
          id?: string
          iv_rank_entry?: number | null
          iv_rank_exit?: number | null
          pop_predicted?: number | null
          pop_realized?: number | null
          profit_factor?: number | null
          quantity?: number
          regime_classification?: string | null
          regime_correct?: boolean | null
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
          starting_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          starting_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          starting_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pocketoption_patterns: {
        Row: {
          accuracy_rate: number
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
          created_at: string
          current_value: number | null
          id: string
          is_active: boolean | null
          is_triggered: boolean | null
          notes: string | null
          notification_sent: boolean | null
          symbol: string
          target_value: number
          triggered_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          current_value?: number | null
          id?: string
          is_active?: boolean | null
          is_triggered?: boolean | null
          notes?: string | null
          notification_sent?: boolean | null
          symbol: string
          target_value: number
          triggered_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          current_value?: number | null
          id?: string
          is_active?: boolean | null
          is_triggered?: boolean | null
          notes?: string | null
          notification_sent?: boolean | null
          symbol?: string
          target_value?: number
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
      subscriptions: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          plan_name: string
          start_date: string
          status: string
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
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trading_journal: {
        Row: {
          ai_analysis: string | null
          ai_suggestions: string[] | null
          analyzed_at: string | null
          content: string
          created_at: string
          emotions: string[] | null
          entry_date: string
          entry_type: string
          id: string
          symbol: string | null
          trade_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_analysis?: string | null
          ai_suggestions?: string[] | null
          analyzed_at?: string | null
          content: string
          created_at?: string
          emotions?: string[] | null
          entry_date?: string
          entry_type: string
          id?: string
          symbol?: string | null
          trade_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_analysis?: string | null
          ai_suggestions?: string[] | null
          analyzed_at?: string | null
          content?: string
          created_at?: string
          emotions?: string[] | null
          entry_date?: string
          entry_type?: string
          id?: string
          symbol?: string | null
          trade_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trading_journal_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "paper_trades"
            referencedColumns: ["id"]
          },
        ]
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
