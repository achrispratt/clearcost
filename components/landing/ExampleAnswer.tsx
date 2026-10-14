/**
 * A real answer from the database, shown as the homepage example so the
 * first screen shows what the product returns. Figures are the knee MRI
 * (CPT 73721) cash prices near Weehawken, NJ, pulled October 2026. Update
 * them by hand if the source rows change.
 */
const EXAMPLE = {
  ask: "I need an MRI of my right knee",
  place: "Weehawken, NJ",
  low: "$280",
  high: "$3,988",
  hospitals: [
    {
      name: "Palisades Medical Center",
      where: "North Bergen · 2.1 mi",
      price: "$280",
      lowest: true,
    },
    {
      name: "Bellevue Hospital Center",
      where: "Manhattan · 2.6 mi",
      price: "$283",
    },
    {
      name: "Hudson Regional Hospital",
      where: "Secaucus · 2.9 mi",
      price: "$3,988",
    },
  ],
};

export function ExampleAnswer() {
  return (
    <figure className="m-0">
      <div className="flex justify-end mb-3">
        <span
          className="inline-block rounded-[16px_4px_16px_16px] px-4 py-2 text-[15px] text-white"
          style={{ background: "var(--cc-primary)" }}
        >
          {EXAMPLE.ask}
        </span>
      </div>
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: "var(--cc-surface)",
          borderColor: "var(--cc-border-strong)",
          boxShadow: "0 18px 40px -24px rgba(26, 26, 46, 0.25)",
        }}
      >
        <div className="px-5 pt-5 pb-4">
          <p
            className="text-[13px] font-medium"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            Cash prices near {EXAMPLE.place}
          </p>
          <p
            className="num text-[40px] leading-[1.05] mt-1"
            style={{
              fontFamily: "var(--font-instrument-serif), Georgia, serif",
              color: "var(--cc-text)",
            }}
          >
            {EXAMPLE.low} – {EXAMPLE.high}
          </p>
        </div>
        <div className="px-5 pb-5">
          <div className="slip">
            {EXAMPLE.hospitals.map((h) => (
              <div className="slip-row" key={h.name}>
                <span>
                  <span
                    className="font-medium"
                    style={{ color: "var(--cc-text)" }}
                  >
                    {h.name}
                  </span>
                  <span className="slip-note">
                    {h.where}
                    {h.lowest && " · lowest"}
                  </span>
                </span>
                <span>{h.price}</span>
              </div>
            ))}
            <div className="slip-row">
              <span>Radiologist&rsquo;s read</span>
              <span style={{ color: "var(--cc-accent)" }}>
                Billed separately
              </span>
            </div>
          </div>
        </div>
      </div>
      <figcaption
        className="mt-3 text-[12px]"
        style={{ color: "var(--cc-text-tertiary)" }}
      >
        A real answer, from hospital price files in October 2026.
      </figcaption>
    </figure>
  );
}
