import { z } from 'zod'

// 練習 1：列出這個應用需要的所有環境變數，以及它們的型別、預設值、限制
export const envSchema = z.object({})

export type Env = z.output<typeof envSchema>
