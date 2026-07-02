"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Grid2X2,
  ImagePlus,
  Loader2,
  Mail,
  Search,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { register } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { uploadToSupabase } from "@/lib/supabase";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function initial(value: string) {
  return value.trim()[0]?.toUpperCase() ?? "P";
}

export default function SetupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"profile" | "workspace">("profile");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [subscribed, setSubscribed] = useState(true);
  const [company, setCompany] = useState("");
  const [country, setCountry] = useState("Morocco");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // File Upload states
  const [avatarUrl, setAvatarUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const slug = useMemo(() => slugify(company), [company]);

  useEffect(() => {
    const storedEmail = window.sessionStorage.getItem("authEmail") ?? "";
    const storedPassword = window.sessionStorage.getItem("authPassword") ?? "";
    setEmail(storedEmail);
    setPassword(storedPassword);

    if (!storedEmail || !storedPassword) {
      router.replace("/login");
    }
  }, [router]);

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAvatar(true);
    setError(null);
    try {
      const url = await uploadToSupabase(file, "avatars");
      setAvatarUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload profile picture.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    setError(null);
    try {
      const url = await uploadToSupabase(file, "logos");
      setLogoUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload workspace logo.");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError("Enter your first name and last name.");
      return;
    }

    setStep("workspace");
  }

  async function submitWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!company.trim() || !slug) {
      setError("Enter a company name to create your workspace.");
      return;
    }

    setIsSubmitting(true);
    try {
      void subscribed;
      void country;
      await register({
        tenantName: company.trim(),
        tenantSlug: slug,
        email,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        avatarUrl: avatarUrl || undefined,
        logoUrl: logoUrl || undefined,
      });

      window.sessionStorage.removeItem("authEmail");
      window.sessionStorage.removeItem("authPassword");
      router.push("/workspace/select");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : "Backend API is not reachable. Start the backend on localhost:3000, then try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-[1100px] overflow-hidden rounded-3xl border border-[#222630]/80 bg-[#0f1115]/90 shadow-[0_24px_90px_rgba(0,0,0,0.55),0_0_1px_rgba(255,255,255,0.08)_inset] backdrop-blur-md transition-all duration-300">
      <div className="h-[3px] w-full bg-[#1c1f26]">
        <div
          className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 transition-all duration-500 ease-out"
          style={{ width: step === "profile" ? "50%" : "100%" }}
        />
      </div>
      <div className="grid min-h-[690px] grid-cols-1 lg:grid-cols-2">
        <section className="relative flex flex-col justify-center px-8 py-12 sm:px-20 lg:border-r border-[#1c1f26]">
          {step === "workspace" ? (
            <button
              aria-label="Back"
              className="absolute left-8 top-8 flex h-8 w-8 items-center justify-center rounded-lg border border-[#22252c] bg-[#161920] text-slate-400 transition-all duration-300 hover:bg-[#1b1f28] hover:text-white hover:scale-105 active:scale-95"
              onClick={() => {
                setError(null);
                setStep("profile");
              }}
              type="button"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : null}

          {step === "profile" ? (
            <ProfileStep
              email={email}
              error={error}
              firstName={firstName}
              lastName={lastName}
              onFirstName={setFirstName}
              onLastName={setLastName}
              onSubmit={submitProfile}
              onSubscribed={setSubscribed}
              subscribed={subscribed}
              avatarUrl={avatarUrl}
              onAvatarUpload={handleAvatarFileChange}
              onAvatarRemove={() => setAvatarUrl("")}
              isUploading={isUploadingAvatar}
              avatarInputRef={avatarInputRef}
            />
          ) : (
            <WorkspaceStep
              company={company}
              country={country}
              error={error}
              isSubmitting={isSubmitting}
              onCompany={setCompany}
              onCountry={setCountry}
              onSubmit={submitWorkspace}
              slug={slug}
              logoUrl={logoUrl}
              onLogoUpload={handleLogoFileChange}
              onLogoRemove={() => setLogoUrl("")}
              isUploading={isUploadingLogo}
              logoInputRef={logoInputRef}
            />
          )}
        </section>

        <aside className="relative hidden items-center justify-center overflow-hidden bg-gradient-to-br from-[#12151b] to-[#0d0f12] px-[72px] lg:flex border-l border-[#1c1f26]">
          {/* Inner ambient glows */}
          <div className="absolute top-[20%] right-[-20%] h-[300px] w-[300px] rounded-full bg-blue-500/5 blur-[80px] pointer-events-none" />
          <div className="absolute bottom-[20%] left-[-20%] h-[300px] w-[300px] rounded-full bg-indigo-500/5 blur-[80px] pointer-events-none" />

          <PreviewPanel
            companyName={company}
            firstName={firstName}
            lastName={lastName}
            mode={step}
            avatarUrl={avatarUrl}
            logoUrl={logoUrl}
          />
        </aside>
      </div>
    </div>
  );
}

function ProfileStep({
  email,
  error,
  firstName,
  lastName,
  onFirstName,
  onLastName,
  onSubmit,
  onSubscribed,
  subscribed,
  avatarUrl,
  onAvatarUpload,
  onAvatarRemove,
  isUploading,
  avatarInputRef,
}: {
  email: string;
  error: string | null;
  firstName: string;
  lastName: string;
  onFirstName: (value: string) => void;
  onLastName: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSubscribed: (value: boolean) => void;
  subscribed: boolean;
  avatarUrl: string;
  onAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAvatarRemove: () => void;
  isUploading: boolean;
  avatarInputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <form className="mx-auto w-full max-w-[372px]" onSubmit={onSubmit}>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-white leading-tight">
          Let&apos;s get to know you
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Complete your profile to set up your account.
        </p>
      </div>

      <div className="mb-8 flex items-center gap-5">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 text-xl font-bold text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.15)] overflow-hidden">
          {isUploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          ) : avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : firstName.trim() ? (
            initial(firstName)
          ) : (
            <UserRound className="h-6 w-6 text-blue-400" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">Profile picture</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <input
              type="file"
              ref={avatarInputRef}
              className="hidden"
              accept="image/*"
              onChange={onAvatarUpload}
            />
            <button
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#22252c] bg-[#161920] px-3 text-xs font-semibold text-slate-200 transition-all duration-300 hover:bg-[#1b1f28] hover:text-white hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
              type="button"
              disabled={isUploading}
              onClick={() => avatarInputRef.current?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5 text-blue-400" />
              Upload image
            </button>
            {avatarUrl ? (
              <button
                className="h-9 rounded-lg border border-transparent px-3 text-xs font-semibold text-slate-500 transition-all duration-300 hover:text-slate-355 hover:underline"
                type="button"
                onClick={onAvatarRemove}
              >
                Remove
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-[10px] text-slate-400 leading-normal">
            PNG or JPEG files up to 10MB.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <Field label="First name">
          <input
            autoFocus
            className="auth-field"
            onChange={(event) => onFirstName(event.target.value)}
            placeholder="Enter your first name..."
            value={firstName}
          />
        </Field>
        <Field label="Last name">
          <input
            className="auth-field"
            onChange={(event) => onLastName(event.target.value)}
            placeholder="Enter your last name..."
            value={lastName}
          />
        </Field>
        <Field label="Email">
          <div className="relative flex h-11 items-center rounded-xl border border-[#1a1c22] bg-[#111318]/50 px-3.5">
            <Mail className="mr-2.5 h-4 w-4 shrink-0 text-slate-600" />
            <input
              className="h-full w-full bg-transparent text-sm font-semibold text-slate-500 outline-none"
              disabled
              value={email}
            />
          </div>
        </Field>
      </div>

      <div className="my-6 border-t border-[#1c1f26]" />

      <label className="flex items-start gap-4 p-3 rounded-xl border border-[#22252c]/50 bg-[#13161c]/30 hover:bg-[#13161c]/60 transition duration-200 cursor-pointer select-none">
        <input
          checked={subscribed}
          className="mt-1 h-4 w-4 rounded border-[#30353d] bg-[#13161c] text-blue-500 focus:ring-blue-500/20"
          onChange={(event) => onSubscribed(event.target.checked)}
          type="checkbox"
        />
        <div>
          <span className="block text-sm font-semibold text-white">
            Subscribe to product update emails
          </span>
          <span className="mt-1 block text-xs text-slate-400 leading-normal">
            Get the latest updates about features and product updates.
          </span>
        </div>
      </label>

      {error ? <ErrorText message={error} /> : null}
      <PrimaryButton className="mt-7" disabled={isUploading}>Continue</PrimaryButton>
    </form>
  );
}

function WorkspaceStep({
  company,
  country,
  error,
  isSubmitting,
  onCompany,
  onCountry,
  onSubmit,
  slug,
  logoUrl,
  onLogoUpload,
  onLogoRemove,
  isUploading,
  logoInputRef,
}: {
  company: string;
  country: string;
  error: string | null;
  isSubmitting: boolean;
  onCompany: (value: string) => void;
  onCountry: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  slug: string;
  logoUrl: string;
  onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLogoRemove: () => void;
  isUploading: boolean;
  logoInputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <form className="mx-auto w-full max-w-[372px]" onSubmit={onSubmit}>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-white leading-tight">
          Create your workspace
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Set up a workspace for your team.
        </p>
      </div>

      <div className="mb-8 flex items-center gap-5">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-[#30353d] bg-[#13161c] text-2xl font-bold text-slate-400 overflow-hidden">
          {isUploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          ) : logoUrl ? (
            <img src={logoUrl} alt="" className="h-full w-full object-cover" />
          ) : company.trim() ? (
            initial(company)
          ) : (
            <BriefcaseBusiness className="h-6 w-6 text-slate-500" />
          )}
        </div>
        <div>
          <p className="text-sm font-bold text-white">Company logo</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="file"
              ref={logoInputRef}
              className="hidden"
              accept="image/*"
              onChange={onLogoUpload}
            />
            <button
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#22252c] bg-[#161920] px-3 text-xs font-semibold text-slate-200 transition-all duration-300 hover:bg-[#1b1f28] hover:text-white hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
              type="button"
              disabled={isUploading}
              onClick={() => logoInputRef.current?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5 text-blue-400" />
              Upload logo
            </button>
            {logoUrl ? (
              <button
                className="h-9 rounded-lg border border-transparent px-3 text-xs font-semibold text-slate-500 transition-all duration-300 hover:text-slate-350 hover:underline"
                type="button"
                onClick={onLogoRemove}
              >
                Remove
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-[10px] text-slate-400 leading-normal">
            PNG, JPEG or GIF under 10MB.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <Field label="Company name">
          <input
            autoFocus
            className="auth-field"
            onChange={(event) => onCompany(event.target.value)}
            placeholder="Enter your company name..."
            value={company}
          />
        </Field>

        <Field label="Workspace handle">
          <div className="flex h-11 items-center rounded-xl border border-[#22252c] bg-[#13161c]/50 px-3.5 text-sm font-semibold text-white">
            <span className="text-slate-500">app.pilot.com/</span>
            <span className="text-blue-400 font-bold ml-0.5 truncate">{slug || "my-workspace"}</span>
          </div>
        </Field>

        <Field label="Billing country">
          <div className="relative">
            <select
              className="auth-field appearance-none pr-10"
              onChange={(event) => onCountry(event.target.value)}
              value={country}
            >
              <option className="bg-[#0f1115]">Morocco</option>
              <option className="bg-[#0f1115]">France</option>
              <option className="bg-[#0f1115]">United States</option>
              <option className="bg-[#0f1115]">United Kingdom</option>
              <option className="bg-[#0f1115]">Spain</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          </div>
        </Field>
      </div>

      {error ? <ErrorText message={error} /> : null}

      <PrimaryButton className="mt-8" disabled={isSubmitting || isUploading}>
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating workspace...
          </>
        ) : (
          "Continue"
        )}
      </PrimaryButton>
    </form>
  );
}

function PreviewPanel({
  companyName,
  firstName,
  lastName,
  mode,
  avatarUrl,
  logoUrl,
}: {
  companyName: string;
  firstName: string;
  lastName: string;
  mode: "profile" | "workspace";
  avatarUrl?: string;
  logoUrl?: string;
}) {
  const name = companyName.trim() || firstName.trim() || "Workspace";
  return (
    <div className="relative flex h-full items-center justify-center p-8 overflow-hidden">
      <div className="w-full max-w-[430px] overflow-hidden rounded-2xl border border-[#222630]/80 bg-[#0f1115]/95 shadow-[0_24px_60px_rgba(0,0,0,0.65),0_0_1px_rgba(255,255,255,0.08)_inset] transition-all duration-300">
        <div className="flex h-14 items-center justify-between border-b border-[#1c1f26] px-4 bg-[#13161c]/40">
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 rounded-lg px-2 py-1 transition-all duration-300 ${
              mode === "workspace"
                ? "bg-blue-500/10 border border-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.15)] scale-102"
                : "border border-transparent"
            }`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-md overflow-hidden text-xs font-bold text-white transition-all duration-300 ${
                mode === "workspace"
                  ? "bg-gradient-to-r from-blue-500 to-indigo-600 shadow-[0_2px_8px_rgba(99,102,241,0.4)]"
                  : "bg-[#242830] text-slate-400"
              }`}>
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initial(name)
                )}
              </span>
              <span className="font-bold text-white text-xs truncate max-w-[100px]">{name}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>
          <BriefcaseBusiness className="h-4 w-4 text-slate-500" />
        </div>
        <div className="grid h-[380px] grid-cols-[140px_1fr]">
          <div className="border-r border-[#1c1f26] p-3 bg-[#13161c]/20">
            <div className="flex h-8 items-center gap-2 rounded-lg border border-[#1c1f26] bg-[#0f1115] px-2 text-slate-500">
              <Search className="h-3.5 w-3.5" />
              <span className="h-1.5 w-12 rounded-full bg-[#1c1f26]" />
              <span className="ml-auto rounded border border-[#1c1f26] px-1 text-[8px] text-slate-600">⌘K</span>
            </div>
            <div className="mt-4 space-y-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <div className="flex items-center gap-2 px-1 py-0.5" key={index}>
                  <Check className="h-3 w-3 text-slate-600" />
                  <span className="h-1.5 rounded-full bg-[#1c1f26]" style={{ width: `${35 + index * 5}px` }} />
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            <div className={`flex h-12 items-center gap-2 border-b border-[#1c1f26] px-4 transition-all duration-300 ${
              mode === "profile"
                ? "bg-blue-500/5 border-b-blue-500/30"
                : ""
            }`}>
              <UserRound className={`h-4 w-4 transition-colors ${mode === "profile" ? "text-blue-400" : "text-slate-500"}`} />
              <span className={`font-bold text-xs transition-colors ${mode === "profile" ? "text-white" : "text-slate-400"}`}>People</span>
            </div>
            <div className="p-4 flex-1 overflow-hidden">
              <div className="flex gap-2 mb-4">
                <PreviewPill icon={<Grid2X2 className="h-3.5 w-3.5" />} />
                <PreviewPill icon={<SlidersHorizontal className="h-3.5 w-3.5" />} />
              </div>
              <div className="space-y-2.5">
                {mode === "profile" && (firstName || lastName) ? (
                  <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-2 py-1.5 shadow-[0_0_10px_rgba(59,130,246,0.1)] scale-102 transition-all duration-300">
                    <span className="h-3.5 w-3.5 rounded border border-blue-500/40 bg-blue-500/20 flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-blue-400" />
                    </span>
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full overflow-hidden bg-gradient-to-r from-blue-500 to-indigo-600 text-[9px] font-bold text-white">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        initial(firstName || lastName)
                      )}
                    </div>
                    <span className="text-[10px] font-semibold text-white truncate max-w-[120px]">
                      {firstName} {lastName} <span className="text-blue-400/80">(You)</span>
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <span className="h-3.5 w-3.5 rounded border border-[#1c1f26]" />
                    <span className="h-5 w-5 rounded-full bg-[#1c1f26] flex items-center justify-center text-[9px] font-semibold text-slate-500">P</span>
                    <span className="h-1.5 rounded-full bg-[#1c1f26] w-16" />
                  </div>
                )}

                {Array.from({ length: 6 }).map((_, index) => (
                  <div className="flex items-center gap-2 px-2 py-1.5 opacity-40" key={index}>
                    <span className="h-3.5 w-3.5 rounded border border-[#1c1f26]" />
                    <span className="h-5 w-5 rounded-full bg-[#1c1f26]" />
                    <span className="h-1.5 rounded-full bg-[#1c1f26]" style={{ width: `${40 + ((index * 13) % 40)}px` }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewPill({ icon }: { icon: React.ReactNode }) {
  return (
    <div className="flex h-8 items-center gap-2 rounded-lg border border-[#1c1f26] bg-[#13161c]/30 px-3 text-slate-500 transition hover:bg-[#13161c]/60 cursor-default">
      {icon}
      <span className="h-1.5 w-8 rounded-full bg-[#1c1f26]" />
    </div>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-slate-300">
        {label}
      </span>
      {children}
    </label>
  );
}

function PrimaryButton({
  children,
  className = "",
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-4 text-sm font-bold text-white transition-all duration-300 transform hover:scale-[1.01] hover:shadow-[0_4px_20px_rgba(99,102,241,0.3)] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 disabled:scale-100 disabled:shadow-none ${className}`}
      disabled={disabled}
      type="submit"
    >
      {children}
    </button>
  );
}

function ErrorText({ message }: { message: string }) {
  return (
    <p className="mt-4 rounded-xl border border-red-500/25 bg-red-950/20 px-3.5 py-2.5 text-xs text-red-300">
      {message}
    </p>
  );
}
