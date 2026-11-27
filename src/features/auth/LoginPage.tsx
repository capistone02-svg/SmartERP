import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "@/features/auth/AuthContext"
import logoWhite from "@/assets/sm-logo-white.svg"
import logo from "@/assets/sm-logo.svg"

function Field(props: {
  id: string
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  autoComplete: string
}) {
  return (
    <div className="relative">
      <label
        htmlFor={props.id}
        className="absolute -top-2 left-3 bg-white px-1 text-[10px] font-semibold uppercase leading-none text-black"
      >
        {props.label}
      </label>
      <input
        id={props.id}
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        className="h-11 w-full rounded-md border border-neutral-500 bg-white px-3 text-sm text-black outline-none placeholder:text-neutral-500 focus:border-[#0e63a6] focus:ring-1 focus:ring-[#0e63a6]"
      />
    </div>
  )
}

export default function LoginPage() {
  const { signIn, notice } = useAuth()
  const [employeeId, setEmployeeId] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!employeeId.trim() || !password) {
      setError("Please enter your Employee ID and password.")
      return
    }
    setError(null)
    setSubmitting(true)
    const message = await signIn(employeeId, password, remember)
    setSubmitting(false)
    if (message) setError(message)
    // On success the router redirects automatically.
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[55fr_45fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-[#0e63a6] text-white lg:block">
        <div className="absolute -right-24 -top-32 h-[520px] w-[520px] rounded-full bg-white/5" />
        <div className="absolute -bottom-40 -left-24 h-[460px] w-[460px] rounded-full bg-white/5" />
        <div
          className="absolute bottom-0 right-0 h-72 w-96 opacity-30"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,.7) 1.5px, transparent 1.5px)",
            backgroundSize: "14px 14px",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-16">
          <div className="flex items-center gap-3">
            <img src={logoWhite} alt="" className="h-14 w-14" />
            <span className="text-3xl">
              <b className="font-semibold">SM</b> <span className="font-light">Supermalls</span>
            </span>
          </div>
          <div>
            <p className="text-6xl font-light leading-tight">Welcome to</p>
            <p className="text-6xl font-bold leading-tight">the ERP System</p>
          </div>
          <div />
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-white px-6 py-12">
        <form onSubmit={onSubmit} className="w-full max-w-[340px]" noValidate>
          <div className="mb-6 flex items-center justify-center gap-2 lg:hidden">
            <img src={logo} alt="" className="h-10 w-10" />
            <span className="text-xl text-[#0e63a6]">
              <b className="font-semibold">SM</b> <span className="font-light">Supermalls</span>
            </span>
          </div>
          <h1 className="text-center text-xl font-bold text-black">Sign in</h1>
          <p className="mb-8 text-center text-base text-neutral-400">Enter your credentials to continue.</p>

          <div className="space-y-6">
            <Field id="employee-id" label="Employee ID" value={employeeId} onChange={setEmployeeId}
              placeholder="e.g. 26-47605" autoComplete="username" />
            <Field id="password" label="Password" type="password" value={password} onChange={setPassword}
              placeholder="Enter Password" autoComplete="current-password" />
          </div>

          <div className="mt-4 flex items-center justify-between text-[11px] font-medium text-black">
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
              Remember me
            </label>
            <button
              type="button"
              className="hover:underline"
              onClick={() =>
                toast.info("Password resets are handled by your system administrator. Please contact them to reset your password.")
              }
            >
              Forgot password?
            </button>
          </div>

          {(error || notice) && (
            <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {error ?? notice}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 h-11 w-full rounded-md bg-[#0e63a6] text-sm font-medium text-white transition hover:bg-[#0b5189] disabled:opacity-60"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  )
}