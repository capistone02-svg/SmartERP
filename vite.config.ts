import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

console.log("Supabase configured:", isSupabaseConfigured)
console.log("Supabase URL:", supabaseUrl)
console.log("Auth method:", typeof supabase.auth.signInWithPassword)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: true,
  },
})
