import { ButtonLink } from "@/components/ui/Button";
import page from "@/components/hub/page.module.css";

export default function NotFound() {
  return (
    <div className={page.page} style={{ minHeight: "70dvh", justifyContent: "center", alignItems: "flex-start" }}>
      <p className="eyebrow">404</p>
      <h1 className={page.title}>This compound is empty.</h1>
      <p className={page.lede}>The page you&apos;re looking for has run away like a thief. Let&apos;s get you back to the games.</p>
      <ButtonLink href="/" icon="home">
        Back home
      </ButtonLink>
    </div>
  );
}
