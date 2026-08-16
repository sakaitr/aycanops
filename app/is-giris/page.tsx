import { redirect } from "next/navigation";
import { todayIstanbul } from "@/lib/time";

// Ofis girişindeki QR posteri bu sayfayı kodlar — okutulduğunda telefonun
// kendi kamerası bu URL'i açar (giriş yapılmamışsa proxy.ts zaten ?next= ile
// login'e yönlendirip sonra buraya geri getirir), buradan direkt bugünün
// günlük/check-in ekranına düşülür.
export default function IsGirisPage() {
  redirect(`/gunluk/${todayIstanbul()}`);
}
