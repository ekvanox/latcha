import { useState, useCallback } from "react";

interface CaptchaGridProps {
  imageUrls: string[];
  question: string;
  onSubmit: (selectedCells: number[]) => void;
  onSkip: () => void;
  disabled: boolean;
}

export function CaptchaGrid({
  imageUrls,
  question,
  onSubmit,
  onSkip,
  disabled,
}: CaptchaGridProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState<Set<number>>(new Set());

  const toggle = useCallback(
    (idx: number) => {
      if (disabled) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        return next;
      });
    },
    [disabled],
  );

  const handleSubmit = useCallback(() => {
    if (disabled || selected.size === 0) return;
    const sorted = Array.from(selected).sort((a, b) => a - b);
    onSubmit(sorted);
  }, [disabled, selected, onSubmit]);

  return (
    <div style={styles.gridWrapper}>
      {/* Instruction header */}
      <div style={styles.gridHeader}>
        <div style={styles.gridHeaderIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <div>
          <div style={styles.gridHeaderTitle}>{question}</div>
          <div style={styles.gridHeaderSub}>Click all matching images</div>
        </div>
      </div>

      {/* 3×3 grid */}
      <div style={styles.grid}>
        {imageUrls.map((url, i) => {
          const cellNum = i + 1; // 1-based
          const isSelected = selected.has(cellNum);
          const isLoaded = loaded.has(cellNum);
          return (
            <button
              key={i}
              onClick={() => toggle(cellNum)}
              disabled={disabled}
              style={{
                ...styles.cell,
                outline: isSelected ? "3px solid #3d5a1e" : "2px solid #e8e2d6",
                outlineOffset: isSelected ? "-3px" : "-2px",
                cursor: disabled ? "default" : "pointer",
              }}
              aria-pressed={isSelected}
              aria-label={`Image ${cellNum}`}
            >
              {/* Spinner while loading */}
              {!isLoaded && (
                <div style={styles.cellSpinner}>
                  <div style={styles.spinner} />
                </div>
              )}

              <img
                src={url}
                alt={`Grid cell ${cellNum}`}
                style={{
                  ...styles.cellImage,
                  opacity: isLoaded ? 1 : 0,
                }}
                onLoad={() => setLoaded((prev) => new Set([...prev, cellNum]))}
              />

              {/* Selected overlay */}
              {isSelected && (
                <div style={styles.selectedOverlay}>
                  <div style={styles.selectedCheck}>✓</div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Action row */}
      <div style={styles.actionRow}>
        <button
          onClick={onSkip}
          disabled={disabled}
          style={{ ...styles.skipBtn, opacity: disabled ? 0.5 : 1 }}
        >
          Skip
        </button>
        <button
          onClick={handleSubmit}
          disabled={disabled || selected.size === 0}
          style={{
            ...styles.submitBtn,
            opacity: disabled || selected.size === 0 ? 0.5 : 1,
            cursor: disabled || selected.size === 0 ? "not-allowed" : "pointer",
          }}
        >
          {disabled ? "Verifying…" : `Verify (${selected.size} selected)`}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  gridWrapper: {
    width: "100%",
    padding: "0",
  },
  gridHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    padding: "14px 16px 12px",
    background: "#3d5a1e",
    color: "#fff",
    borderRadius: "6px 6px 0 0",
  },
  gridHeaderIcon: {
    flexShrink: 0,
    marginTop: "1px",
    opacity: 0.9,
  },
  gridHeaderTitle: {
    fontSize: "15px",
    fontWeight: 500,
    lineHeight: 1.3,
    marginBottom: "2px",
  },
  gridHeaderSub: {
    fontSize: "12px",
    opacity: 0.8,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "3px",
    background: "#3d5a1e",
    padding: "3px",
  },
  cell: {
    position: "relative",
    aspectRatio: "1",
    overflow: "hidden",
    background: "#ebe5d9",
    border: "none",
    padding: 0,
    display: "block",
    transition: "outline 80ms ease",
  },
  cellSpinner: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#ebe5d9",
    zIndex: 1,
  },
  spinner: {
    width: "20px",
    height: "20px",
    border: "2px solid #ddd7cb",
    borderTopColor: "#3d5a1e",
    borderRadius: "50%",
    animation: "lw-spin 0.7s linear infinite",
  },
  cellImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    transition: "opacity 0.2s ease",
  },
  selectedOverlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(61, 90, 30, 0.25)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    padding: "6px",
    pointerEvents: "none",
  },
  selectedCheck: {
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    background: "#3d5a1e",
    color: "#fff",
    fontSize: "13px",
    fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  actionRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    background: "#f5f0e8",
    borderTop: "1px solid #e8e2d6",
    borderRadius: "0 0 6px 6px",
  },
  skipBtn: {
    background: "none",
    border: "none",
    padding: "6px 8px",
    fontSize: "13px",
    color: "#8a8478",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "color 0.15s",
  },
  submitBtn: {
    background: "#3d5a1e",
    border: "none",
    borderRadius: "4px",
    padding: "8px 18px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#fff",
    fontFamily: "inherit",
    transition: "background 0.15s, opacity 0.15s",
  },
};
