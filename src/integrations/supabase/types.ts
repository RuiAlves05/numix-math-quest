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
      conversations: {
        Row: {
          blocked_at: string | null
          created_at: string
          deleted_for_user_one_at: string | null
          deleted_for_user_two_at: string | null
          id: string
          status: string
          updated_at: string
          user_one_id: string
          user_two_id: string
        }
        Insert: {
          blocked_at?: string | null
          created_at?: string
          deleted_for_user_one_at?: string | null
          deleted_for_user_two_at?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_one_id: string
          user_two_id: string
        }
        Update: {
          blocked_at?: string | null
          created_at?: string
          deleted_for_user_one_at?: string | null
          deleted_for_user_two_at?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_one_id?: string
          user_two_id?: string
        }
        Relationships: []
      }
      friend_requests: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          receiver_id: string
          sender_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          receiver_id: string
          sender_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          receiver_id?: string
          sender_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      friendship_actions: {
        Row: {
          action_type: string
          actor_id: string
          can_undo: boolean
          created_at: string
          expires_at: string
          id: string
          previous_state: Json | null
          target_id: string
          undone_at: string | null
        }
        Insert: {
          action_type: string
          actor_id: string
          can_undo?: boolean
          created_at?: string
          expires_at?: string
          id?: string
          previous_state?: Json | null
          target_id: string
          undone_at?: string | null
        }
        Update: {
          action_type?: string
          actor_id?: string
          can_undo?: boolean
          created_at?: string
          expires_at?: string
          id?: string
          previous_state?: Json | null
          target_id?: string
          undone_at?: string | null
        }
        Relationships: []
      }
      friendships: {
        Row: {
          created_at: string
          friend_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_used_at: string | null
          created_at: string
          data: Json | null
          deleted_at: string | null
          expires_at: string | null
          id: string
          message: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_used_at?: string | null
          created_at?: string
          data?: Json | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          message: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_used_at?: string | null
          created_at?: string
          data?: Json | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          message?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          id: string
          level: number | null
          show_on_leaderboard: boolean
          streak_days: number | null
          total_points: number | null
          updated_at: string | null
          user_id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          level?: number | null
          show_on_leaderboard?: boolean
          streak_days?: number | null
          total_points?: number | null
          updated_at?: string | null
          user_id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          level?: number | null
          show_on_leaderboard?: boolean
          streak_days?: number | null
          total_points?: number | null
          updated_at?: string | null
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          category: string
          correct_answer: string
          created_at: string | null
          difficulty: string | null
          difficulty_level: number
          explanation: string | null
          id: string
          is_active: boolean
          options: string[]
          points: number | null
          question_text: string
          school_year: number | null
          topic: string | null
        }
        Insert: {
          category: string
          correct_answer: string
          created_at?: string | null
          difficulty?: string | null
          difficulty_level: number
          explanation?: string | null
          id?: string
          is_active?: boolean
          options: string[]
          points?: number | null
          question_text: string
          school_year?: number | null
          topic?: string | null
        }
        Update: {
          category?: string
          correct_answer?: string
          created_at?: string | null
          difficulty?: string | null
          difficulty_level?: number
          explanation?: string | null
          id?: string
          is_active?: boolean
          options?: string[]
          points?: number | null
          question_text?: string
          school_year?: number | null
          topic?: string | null
        }
        Relationships: []
      }
      tutor_error_memory: {
        Row: {
          cleared_at: string | null
          created_at: string
          error_category: string | null
          error_type: string
          id: string
          is_active: boolean
          last_seen_at: string
          level: number | null
          occurrence_count: number
          topic: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cleared_at?: string | null
          created_at?: string
          error_category?: string | null
          error_type: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          level?: number | null
          occurrence_count?: number
          topic?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cleared_at?: string | null
          created_at?: string
          error_category?: string | null
          error_type?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          level?: number | null
          occurrence_count?: number
          topic?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_answers: {
        Row: {
          answered_at: string | null
          base_points: number | null
          id: string
          is_correct: boolean
          level: number | null
          multiplier: number | null
          points_earned: number | null
          question_id: string
          streak_after_answer: number | null
          user_answer: string
          user_id: string
        }
        Insert: {
          answered_at?: string | null
          base_points?: number | null
          id?: string
          is_correct: boolean
          level?: number | null
          multiplier?: number | null
          points_earned?: number | null
          question_id: string
          streak_after_answer?: number | null
          user_answer: string
          user_id: string
        }
        Update: {
          answered_at?: string | null
          base_points?: number | null
          id?: string
          is_correct?: boolean
          level?: number | null
          multiplier?: number | null
          points_earned?: number | null
          question_id?: string
          streak_after_answer?: number | null
          user_answer?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      user_level_stats: {
        Row: {
          best_streak: number
          correct_answers: number
          created_at: string
          current_streak: number
          id: string
          level: number
          points: number
          total_answers: number
          updated_at: string
          user_id: string
        }
        Insert: {
          best_streak?: number
          correct_answers?: number
          created_at?: string
          current_streak?: number
          id?: string
          level: number
          points?: number
          total_answers?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          best_streak?: number
          correct_answers?: number
          created_at?: string
          current_streak?: number
          id?: string
          level?: number
          points?: number
          total_answers?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_progress: {
        Row: {
          current_level: number | null
          current_streak: number | null
          id: string
          last_activity_date: string | null
          questions_completed: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          current_level?: number | null
          current_streak?: number | null
          id?: string
          last_activity_date?: string | null
          questions_completed?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          current_level?: number | null
          current_streak?: number | null
          id?: string
          last_activity_date?: string | null
          questions_completed?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _are_friends: { Args: { _a: string; _b: string }; Returns: boolean }
      _is_blocked_either: { Args: { _a: string; _b: string }; Returns: boolean }
      block_user: { Args: { _target: string }; Returns: Json }
      cancel_friend_request: { Args: { _request_id: string }; Returns: Json }
      clear_all_tutor_memory: { Args: never; Returns: undefined }
      clear_tutor_error: { Args: { _memory_id: string }; Returns: undefined }
      clear_tutor_error_by_type: {
        Args: { _error_type: string; _level?: number; _topic?: string }
        Returns: undefined
      }
      delete_all_notifications: { Args: never; Returns: undefined }
      delete_notification: {
        Args: { _notification_id: string }
        Returns: undefined
      }
      get_blocked_users: {
        Args: never
        Returns: {
          avatar_url: string
          blocked_at: string
          display_name: string
          user_id: string
        }[]
      }
      get_conversation_messages: {
        Args: { _conversation_id: string }
        Returns: {
          body: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          read_at: string | null
          sender_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_conversation_messages_with_profiles: {
        Args: { _conversation_id: string }
        Returns: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          read_at: string
          sender_avatar_url: string
          sender_display_name: string
          sender_id: string
        }[]
      }
      get_friends: {
        Args: never
        Returns: {
          avatar_url: string
          best_streak: number
          display_name: string
          total_points: number
          user_id: string
        }[]
      }
      get_leaderboard: {
        Args: { _level: number; _limit?: number }
        Returns: {
          avatar_url: string
          best_streak: number
          correct_answers: number
          display_name: string
          points: number
          rank: number
          total_answers: number
          user_id: string
        }[]
      }
      get_mailbox: {
        Args: never
        Returns: {
          action_used_at: string | null
          created_at: string
          data: Json | null
          deleted_at: string | null
          expires_at: string | null
          id: string
          message: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_or_create_conversation: { Args: { _friend: string }; Returns: Json }
      get_random_quiz_questions: {
        Args: { _level: number }
        Returns: {
          category: string
          difficulty: string
          difficulty_level: number
          id: string
          options: string[]
          points: number
          question_text: string
          school_year: number
          topic: string
        }[]
      }
      get_tutor_error_memory: {
        Args: never
        Returns: {
          cleared_at: string | null
          created_at: string
          error_category: string | null
          error_type: string
          id: string
          is_active: boolean
          last_seen_at: string
          level: number | null
          occurrence_count: number
          topic: string | null
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tutor_error_memory"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_conversations: {
        Args: never
        Returns: {
          avatar_url: string
          conversation_id: string
          friend_id: string
          friend_name: string
          last_message: string
          last_message_at: string
          status: string
          unread_count: number
        }[]
      }
      list_friend_requests: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          direction: string
          display_name: string
          expires_at: string
          id: string
          other_user_id: string
          status: string
        }[]
      }
      mark_all_notifications_read: { Args: never; Returns: undefined }
      mark_conversation_read: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
      mark_notification_read: {
        Args: { _notification_id: string }
        Returns: undefined
      }
      remove_friend: { Args: { _friend: string }; Returns: Json }
      respond_friend_request: {
        Args: { _action: string; _request_id: string }
        Returns: Json
      }
      search_users: {
        Args: { _term: string }
        Returns: {
          avatar_url: string
          display_name: string
          relation_state: string
          request_id: string
          total_points: number
          user_id: string
        }[]
      }
      send_friend_request: { Args: { _target: string }; Returns: Json }
      send_message: {
        Args: { _body: string; _conversation_id: string }
        Returns: Json
      }
      submit_answer: {
        Args: { _question_id: string; _user_answer: string }
        Returns: Json
      }
      unblock_user: { Args: { _target: string }; Returns: Json }
      undo_block_user: { Args: { _action_id: string }; Returns: Json }
      undo_remove_friend: { Args: { _action_id: string }; Returns: Json }
      upsert_tutor_error_memory: {
        Args: {
          _category?: string
          _error_type: string
          _level: number
          _topic: string
          _user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
