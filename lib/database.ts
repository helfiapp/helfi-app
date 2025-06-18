import { sql } from '@vercel/postgres';

export interface UserHealthData {
  id?: string;
  email: string;
  gender?: string;
  weight?: number;
  height?: number;
  bodyType?: string;
  exerciseFrequency?: string;
  exerciseTypes?: string[];
  healthGoals?: string[];
  supplements?: any[];
  medications?: any[];
  aiInsights?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class HealthDatabase {
  static async init() {
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS user_health_data (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `;
      console.log('✅ Database initialized successfully');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
    }
  }

  static async saveUserData(email: string, data: any) {
    try {
      const result = await sql`
        INSERT INTO user_health_data (email, data, updated_at)
        VALUES (${email}, ${JSON.stringify(data)}, NOW())
        ON CONFLICT (email)
        DO UPDATE SET data = ${JSON.stringify(data)}, updated_at = NOW()
        RETURNING *
      `;
      console.log('✅ User data saved successfully');
      return { success: true, data: result.rows[0] };
    } catch (error) {
      console.error('❌ Failed to save user data:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getUserData(email: string) {
    try {
      const result = await sql`
        SELECT data FROM user_health_data 
        WHERE email = ${email}
      `;
      
      if (result.rows.length > 0) {
        console.log('✅ User data retrieved successfully');
        return { success: true, data: result.rows[0].data };
      } else {
        console.log('ℹ️ No data found for user');
        return { success: true, data: null };
      }
    } catch (error) {
      console.error('❌ Failed to retrieve user data:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
} 