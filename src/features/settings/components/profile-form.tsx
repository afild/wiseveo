"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Upload } from "lucide-react"
import { useRef, useState } from "react"
import { Separator } from "@/components/ui/separator"
import { Logo } from "@/components/logo"
import { toast } from "sonner"
import * as React from "react"

import { useTranslations } from "next-intl"
import { withDemoDisplayIdentity } from "@/lib/demo-identity"

export function ProfileForm() {
  const t = useTranslations("settings.profile")
  // D6 (30/08/2026): na demo, o e-mail (real, `demo_<uuid>@...`) nunca aparece na UI.
  const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true"

  const profileFormSchema = z.object({
    firstName: z.string().min(1, t("firstNameReq")),
    lastName: z.string().min(1, t("lastNameReq")),
    email: z.string().email(t("emailReq")),
    phone: z.string().optional(),
    website: z.string().optional(),
    location: z.string().optional(),
    role: z.string().optional(),
    bio: z.string().optional(),
    company: z.string().optional(),
    timezone: z.string().optional(),
    language: z.string().optional(),
  })

  type ProfileFormValues = z.infer<typeof profileFormSchema>
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [useDefaultIcon, setUseDefaultIcon] = useState(true)
  
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      website: "",
      location: "",
      role: "",
      bio: "",
      company: "",
      timezone: "",
      language: "",
    },
  })

  React.useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/user/profile")
        const data = await res.json()
        if (data.success && data.data) {
          const user = data.data
          const preferences = user.preferencesJson?.profile || {}

          // D6: na demo, o nome exibido/pré-preenchido é o da marca (não-editável de fato,
          // pois não há constraint de unicidade em `name` — salvar sem alterar é inofensivo).
          // O e-mail NUNCA passa por withDemoDisplayIdentity aqui: o campo é editável e
          // `email` é @unique — pré-preencher com demo@wiseveo.com faria um Save sem edição
          // gravar esse valor na linha da cópia e colidir com a vitrine.
          const displayName = withDemoDisplayIdentity({ name: user.name }).name
          const nameParts = (displayName || "").split(" ")
          const firstName = nameParts[0] || ""
          const lastName = nameParts.slice(1).join(" ")

          form.reset({
            firstName,
            lastName,
            email: user.email || "",
            phone: user.phone || "",
            company: preferences.company || "",
            website: preferences.website || "",
            location: preferences.location || "",
            language: preferences.language || "",
            role: preferences.role || "",
            timezone: preferences.timezone || "",
            bio: preferences.bio || "",
          })
          
          if (user.photo) {
            setProfileImage(user.photo)
            setUseDefaultIcon(false)
          }
        }
      } catch (error) {
        console.error("Erro ao carregar perfil:", error)
      }
    }
    loadProfile()
  }, [form])

  async function onSubmit(data: ProfileFormValues) {
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (res.ok) {
        toast.success(t("success"))
      } else {
        toast.error(t("error"))
      }
    } catch (error) {
      toast.error(t("connError"))
    }
  }

  const handleFileUpload = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        setProfileImage(e.target?.result as string)
        setUseDefaultIcon(false)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleReset = () => {
    setProfileImage(null)
    setUseDefaultIcon(true)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card className="border-0 shadow-none">
          <CardHeader className="px-0">
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-0">
            {/* Profile Picture Section */}
            <div className="flex items-center gap-6 ">
              {useDefaultIcon ? (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-primary/10">
                   <Logo size={40} />
                </div>
              ) : (
                <Avatar className="h-20 w-20 rounded-lg">
                  <AvatarImage src={profileImage || undefined} />
                  {/* i18n-ignore: avatar fallback initials, not language-dependent */}
                  <AvatarFallback>AF</AvatarFallback>
                </Avatar>
              )}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button 
                    variant="default" 
                    size="sm"
                    onClick={handleFileUpload}
                    type="button"
                    className="cursor-pointer"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {t("uploadPhoto")}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleReset}
                    type="button"
                    className="cursor-pointer"
                  >
                    {t("reset")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("photoLimits")}
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/gif,image/png"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <Separator className="mb-10" />
            
            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* First Name */}
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("firstName")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("firstNamePl")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Last Name */}
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("lastName")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("lastNamePl")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Email — oculto na demo (D6: sem e-mail visível em lugar nenhum) */}
              {!isDemo && (
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("email")}</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder={t("emailPl")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Company */}
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("company")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("companyPl")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Phone Number */}
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("phone")}</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder={t("phonePl")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Location */}
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("location")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("locationPl")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Website */}
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("website")}</FormLabel>
                    <FormControl>
                      <Input type="url" placeholder={t("websitePl")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Language */}
              <FormField
                control={form.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("language")}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("languagePl")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="portuguese">{t("langPt")}</SelectItem>
                        <SelectItem value="english">{t("langEn")}</SelectItem>
                        <SelectItem value="spanish">{t("langEs")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Role */}
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("role")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("rolePl")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Timezone */}
              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("timezone")}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("timezonePl")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="brt">{t("tzBrt")}</SelectItem>
                        <SelectItem value="utc">{t("tzUtc")}</SelectItem>
                        <SelectItem value="pst">{t("tzPst")}</SelectItem>
                        <SelectItem value="est">{t("tzEst")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Bio - Full Width */}
            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("bio")}</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder={t("bioPl")} 
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Action Buttons */}
            <div className="flex justify-start gap-3">
              <Button type="submit" className="cursor-pointer">
                {t("save")}
              </Button>
              <Button variant="outline" type="button" className="cursor-pointer">
                {t("cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  )
}
