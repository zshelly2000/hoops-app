'use client'

interface Props {
  team1Score: string
  team2Score: string
  onTeam1Change: (v: string) => void
  onTeam2Change: (v: string) => void
}

export function ScoreEntry({ team1Score, team2Score, onTeam1Change, onTeam2Change }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <ScoreInput
        label="Team 1"
        labelColor="text-blue-400"
        value={team1Score}
        onChange={onTeam1Change}
      />
      <ScoreInput
        label="Team 2"
        labelColor="text-[#fb923c]"
        value={team2Score}
        onChange={onTeam2Change}
      />
    </div>
  )
}

function ScoreInput({
  label,
  labelColor,
  value,
  onChange,
}: {
  label: string
  labelColor: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={`text-xs font-bold uppercase tracking-wider ${labelColor}`}>
        {label}
      </label>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={999}
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/[.06] bg-surface-raised py-4 text-center text-3xl font-bold text-[#f0f0f8] focus:border-orange-400 focus:outline-none"
      />
    </div>
  )
}
