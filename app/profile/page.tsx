"use client";

import { useEffect, useState, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import {
  getProfile,
  updateProfile,
  uploadProfilePicture,
  deleteProfilePicture,
  sendEmailOtp,
  verifyEmailOtp,
} from "@/lib/api";
import { UserProfile } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const AVATAR_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#6366F1", "#14B8A6",
  "#F97316", "#06B6D4",
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export default function ProfilePage() {
  const { token, username } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Email update state
  const [emailEditing, setEmailEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState(["", "", "", "", "", ""]);
  const [emailStep, setEmailStep] = useState<"input" | "otp">("input");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailCooldown, setEmailCooldown] = useState(0);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const emailOtpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, router]);

  async function loadProfile() {
    if (!token) return;
    setLoading(true);
    try {
      const p = await getProfile(token);
      setProfile(p);
      setDisplayName(p.displayName || "");
      setBio(p.bio || "");
    } catch {
      setError("Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      const updated = await updateProfile(token, {
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
      });
      setProfile(updated);
      setEditing(false);
      setSuccess("Profile updated successfully");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  async function handlePictureUpload(file: File) {
    if (!token) return;

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setError("File size must be less than 5MB");
      setTimeout(() => setError(""), 3000);
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Only JPEG, PNG, GIF, and WebP images are allowed");
      setTimeout(() => setError(""), 3000);
      return;
    }

    setUploading(true);
    setError("");
    try {
      const updated = await uploadProfilePicture(token, file);
      setProfile(updated);
      setSuccess("Profile picture updated");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload picture");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeletePicture() {
    if (!token || !profile?.profilePictureUrl) return;
    setUploading(true);
    setError("");
    try {
      const updated = await deleteProfilePicture(token);
      setProfile(updated);
      setSuccess("Profile picture removed");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove picture");
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handlePictureUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Email cooldown timer
  useEffect(() => {
    if (emailCooldown <= 0) return;
    const timer = setTimeout(() => setEmailCooldown(emailCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [emailCooldown]);

  async function handleSendEmailOtp(e: FormEvent) {
    e.preventDefault();
    if (!token || !newEmail.trim()) return;
    setEmailLoading(true);
    setEmailError("");
    setEmailSuccess("");
    try {
      const res = await sendEmailOtp(token, newEmail.trim());
      setEmailSuccess(res.message || "OTP sent to your email");
      setEmailStep("otp");
      setEmailCooldown(60);
      setTimeout(() => emailOtpRefs.current[0]?.focus(), 100);
      setTimeout(() => setEmailSuccess(""), 4000);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Failed to send OTP");
      setTimeout(() => setEmailError(""), 4000);
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleVerifyEmailOtp(e: FormEvent) {
    e.preventDefault();
    const otpString = emailOtp.join("");
    if (otpString.length !== 6) {
      setEmailError("Please enter the complete 6-digit OTP");
      setTimeout(() => setEmailError(""), 3000);
      return;
    }
    if (!token) return;
    setEmailLoading(true);
    setEmailError("");
    setEmailSuccess("");
    try {
      const updated = await verifyEmailOtp(token, otpString);
      setProfile(updated);
      setSuccess("Email updated successfully");
      setEmailEditing(false);
      setEmailStep("input");
      setNewEmail("");
      setEmailOtp(["", "", "", "", "", ""]);
      setEmailError("");
      setEmailSuccess("");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Invalid OTP");
      setEmailOtp(["", "", "", "", "", ""]);
      setTimeout(() => emailOtpRefs.current[0]?.focus(), 100);
    } finally {
      setEmailLoading(false);
    }
  }

  function handleEmailOtpChange(index: number, value: string) {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").slice(0, 6).split("");
      const newOtp = [...emailOtp];
      digits.forEach((d, i) => {
        if (index + i < 6) newOtp[index + i] = d;
      });
      setEmailOtp(newOtp);
      const nextIndex = Math.min(index + digits.length, 5);
      emailOtpRefs.current[nextIndex]?.focus();
      return;
    }
    if (value && !/^\d$/.test(value)) return;
    const newOtp = [...emailOtp];
    newOtp[index] = value;
    setEmailOtp(newOtp);
    if (value && index < 5) emailOtpRefs.current[index + 1]?.focus();
  }

  function handleEmailOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !emailOtp[index] && index > 0) {
      emailOtpRefs.current[index - 1]?.focus();
    }
  }

  async function handleResendEmailOtp() {
    if (emailCooldown > 0 || !token || !newEmail.trim()) return;
    setEmailLoading(true);
    setEmailError("");
    setEmailSuccess("");
    try {
      const res = await sendEmailOtp(token, newEmail.trim());
      setEmailSuccess(res.message || "OTP resent");
      setEmailCooldown(60);
      setEmailOtp(["", "", "", "", "", ""]);
      setTimeout(() => emailOtpRefs.current[0]?.focus(), 100);
      setTimeout(() => setEmailSuccess(""), 4000);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Failed to resend OTP");
      setTimeout(() => setEmailError(""), 4000);
    } finally {
      setEmailLoading(false);
    }
  }

  if (!token || !username) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => router.push("/chat")}
            className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-900">Profile</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Notifications */}
        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
            {success}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : profile ? (
          <div className="space-y-6">
            {/* Profile Picture Card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex flex-col items-center">
                {/* Avatar */}
                <div className="relative group">
                  {profile.profilePictureUrl ? (
                    <Image
                      src={`${API_BASE}${profile.profilePictureUrl}`}
                      alt={profile.username}
                      width={112}
                      height={112}
                      className="w-28 h-28 rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div
                      className="w-28 h-28 rounded-full flex items-center justify-center text-white text-4xl font-bold"
                      style={{ backgroundColor: avatarColor(profile.username) }}
                    >
                      {profile.username[0].toUpperCase()}
                    </div>
                  )}

                  {/* Upload overlay */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer disabled:cursor-not-allowed"
                  >
                    {uploading ? (
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                {/* Name & username */}
                <h2 className="mt-4 text-xl font-bold text-gray-900">
                  {profile.displayName || profile.username}
                </h2>
                {profile.displayName && (
                  <p className="text-sm text-gray-500 mt-0.5">@{profile.username}</p>
                )}

                {/* Picture actions */}
                <div className="flex items-center gap-3 mt-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="px-4 py-2 text-sm font-medium hover:bg-gray-50 rounded-lg transition cursor-pointer disabled:opacity-50"
                    style={{ color: "#13C9A0" }}
                  >
                    {profile.profilePictureUrl ? "Change Photo" : "Upload Photo"}
                  </button>
                  {profile.profilePictureUrl && (
                    <button
                      onClick={handleDeletePicture}
                      disabled={uploading}
                      className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Profile Details Card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-gray-900">Profile Details</h3>
                {!editing && (
                  <button
                    onClick={() => setEditing(true)}
                    className="px-4 py-2 text-sm font-medium hover:bg-gray-50 rounded-lg transition cursor-pointer"
                    style={{ color: "#13C9A0" }}
                  >
                    Edit
                  </button>
                )}
              </div>

              {editing ? (
                <form onSubmit={handleSave} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Enter display name"
                      maxLength={50}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Bio
                    </label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Write something about yourself..."
                      rows={3}
                      maxLength={200}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none"
                    />
                    <p className="text-xs text-gray-400 mt-1 text-right">{bio.length}/200</p>
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2.5 rounded-xl text-white text-sm font-medium transition disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                      style={{ background: "#13C9A0" }}
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(false);
                        setDisplayName(profile.displayName || "");
                        setBio(profile.bio || "");
                      }}
                      className="px-5 py-2.5 rounded-xl text-gray-600 hover:bg-gray-100 text-sm font-medium transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Username
                    </p>
                    <p className="text-sm text-gray-900 mt-1">@{profile.username}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Display Name
                    </p>
                    <p className="text-sm text-gray-900 mt-1">
                      {profile.displayName || <span className="text-gray-400 italic">Not set</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Bio
                    </p>
                    <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">
                      {profile.bio || <span className="text-gray-400 italic">Not set</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Joined
                    </p>
                    <p className="text-sm text-gray-900 mt-1">
                      {profile.createdAt && !isNaN(new Date(profile.createdAt).getTime())
                        ? new Date(profile.createdAt).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })
                        : <span className="text-gray-400 italic">Unknown</span>}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Email Card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-gray-900">Email Address</h3>
                {!emailEditing && (
                  <button
                    onClick={() => { setEmailEditing(true); setEmailStep("input"); setNewEmail(""); setEmailOtp(["", "", "", "", "", ""]); }}
                    className="px-4 py-2 text-sm font-medium hover:bg-gray-50 rounded-lg transition cursor-pointer"
                    style={{ color: "#13C9A0" }}
                  >
                    {profile.email ? "Change" : "Add Email"}
                  </button>
                )}
              </div>

              {!emailEditing ? (
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Email</p>
                  <p className="text-sm text-gray-900 mt-1">
                    {profile.email || <span className="text-gray-400 italic">No email set</span>}
                  </p>
                  {!profile.email && (
                    <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      Add an email to enable password recovery
                    </p>
                  )}
                </div>
              ) : emailStep === "input" ? (
                <form onSubmit={handleSendEmailOtp} className="space-y-4">
                  {emailError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{emailError}</div>
                  )}
                  {emailSuccess && (
                    <div className="p-3 rounded-lg border text-sm" style={{ background: "#f0fdf9", borderColor: "#a7f3d0", color: "#065f46" }}>{emailSuccess}</div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">New email address</label>
                    <input
                      type="email"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="Enter new email"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:border-transparent transition"
                      style={{ outlineColor: "#13C9A0" }}
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={emailLoading}
                      className="px-5 py-2.5 rounded-xl text-white text-sm font-medium transition disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                      style={{ background: "#13C9A0" }}
                    >
                      {emailLoading ? "Sending..." : "Send Verification OTP"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEmailEditing(false); setNewEmail(""); }}
                      className="px-5 py-2.5 rounded-xl text-gray-600 hover:bg-gray-100 text-sm font-medium transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleVerifyEmailOtp} className="space-y-4">
                  {emailError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{emailError}</div>
                  )}
                  {emailSuccess && (
                    <div className="p-3 rounded-lg border text-sm" style={{ background: "#f0fdf9", borderColor: "#a7f3d0", color: "#065f46" }}>{emailSuccess}</div>
                  )}
                  <p className="text-sm text-gray-500">We sent a 6-digit code to <span className="font-medium text-gray-700">{newEmail}</span></p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">Enter verification code</label>
                    <div className="flex justify-center gap-2 sm:gap-3">
                      {emailOtp.map((digit, index) => (
                        <input
                          key={index}
                          ref={(el) => { emailOtpRefs.current[index] = el; }}
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={digit}
                          onChange={(e) => handleEmailOtpChange(index, e.target.value)}
                          onKeyDown={(e) => handleEmailOtpKeyDown(index, e)}
                          className="w-10 h-12 sm:w-12 sm:h-14 text-center text-lg font-bold rounded-lg border-2 bg-white text-gray-900 outline-none transition"
                          style={{ borderColor: digit ? "#13C9A0" : "#d1d5db" }}
                          onFocus={(e) => e.target.select()}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={emailLoading || emailOtp.join("").length !== 6}
                      className="px-5 py-2.5 rounded-xl text-white text-sm font-medium transition disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                      style={{ background: "#13C9A0" }}
                    >
                      {emailLoading ? "Verifying..." : "Verify & Update"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEmailEditing(false); setEmailStep("input"); setNewEmail(""); setEmailOtp(["", "", "", "", "", ""]); }}
                      className="px-5 py-2.5 rounded-xl text-gray-600 hover:bg-gray-100 text-sm font-medium transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="text-sm text-gray-500">
                    Didn&apos;t receive the code?{" "}
                    {emailCooldown > 0 ? (
                      <span className="text-gray-400">Resend in {emailCooldown}s</span>
                    ) : (
                      <button type="button" onClick={handleResendEmailOtp} disabled={emailLoading} className="font-medium hover:underline cursor-pointer disabled:opacity-50" style={{ color: "#13C9A0" }}>
                        Resend OTP
                      </button>
                    )}
                    {" · "}
                    <button type="button" onClick={() => { setEmailStep("input"); setEmailOtp(["", "", "", "", "", ""]); }} className="font-medium hover:underline cursor-pointer" style={{ color: "#13C9A0" }}>
                      Change email
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-500 py-20">
            Could not load profile.
          </div>
        )}
      </main>
    </div>
  );
}
