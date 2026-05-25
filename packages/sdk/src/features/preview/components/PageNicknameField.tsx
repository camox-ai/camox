import { Input } from "@camox/ui/input";
import { Label } from "@camox/ui/label";

const PAGE_NICKNAME_MAX_LENGTH = 80;

type PageNicknameFieldProps = {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
};

const PageNicknameField = ({ value, onChange, autoFocus }: PageNicknameFieldProps) => (
  <div className="space-y-2">
    <Label htmlFor="pageNickname">Nickname</Label>
    <Input
      id="pageNickname"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="e.g. Home, Pricing, About"
      maxLength={PAGE_NICKNAME_MAX_LENGTH}
      autoFocus={autoFocus}
    />
    <p className="text-muted-foreground text-xs">
      A short internal name used in Camox Studio. Does not affect SEO.
    </p>
  </div>
);

export { PAGE_NICKNAME_MAX_LENGTH, PageNicknameField };
