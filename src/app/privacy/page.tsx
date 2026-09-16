export const metadata = {
  title: "Privacy Policy — Jillian's Auto-Editor",
};

export default function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-sm leading-7 text-neutral-800">
      <h1 className="mb-2 text-2xl font-semibold text-neutral-900">Privacy Policy</h1>
      <p className="mb-8 text-neutral-500">Last updated: September 16, 2026</p>

      <p className="mb-6">
        Jillian&apos;s Auto-Editor (&quot;the app&quot;) is a personal, single-user application built
        and used by Jillian Wu to edit her own video content and review her own TikTok
        performance data. It is not a public product, does not have multiple user accounts,
        and does not collect data from anyone other than its one owner/operator.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold text-neutral-900">What data the app stores</h2>
      <ul className="mb-6 list-disc space-y-2 pl-5">
        <li>Video files uploaded by the app owner, and derived transcripts/edit data.</li>
        <li>
          TikTok account performance data (video IDs, view/like/comment/share counts,
          captions, post timestamps) retrieved via TikTok&apos;s Login Kit and Display API,
          using an OAuth connection the app owner authorizes to her own TikTok account.
        </li>
        <li>
          TikTok Studio analytics exports (e.g. watch time, retention, traffic source)
          manually uploaded by the app owner as CSV files.
        </li>
      </ul>

      <h2 className="mb-2 mt-8 text-lg font-semibold text-neutral-900">How this data is used</h2>
      <p className="mb-6">
        All data is used solely to power the app owner&apos;s own editing tools and
        performance dashboards. It is not sold, shared, rented, or disclosed to any
        third party, and is not used for advertising or any purpose unrelated to the
        app&apos;s core function. Data retrieved via TikTok&apos;s APIs is used strictly in
        accordance with TikTok&apos;s Developer Terms of Service and API Terms.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold text-neutral-900">Where data is stored</h2>
      <p className="mb-6">
        Data is stored in a private Supabase project (Postgres database and file storage)
        accessible only to the app owner via authenticated login. No data is publicly
        readable.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold text-neutral-900">Data retention and deletion</h2>
      <p className="mb-6">
        Data is retained for as long as the app owner continues to use the app. Any
        data, including TikTok account data obtained via API, can be deleted on request
        by contacting the address below.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold text-neutral-900">Contact</h2>
      <p>
        Questions about this policy or data deletion requests can be sent to{" "}
        <a className="underline" href="mailto:jillian.w@wustl.edu">
          jillian.w@wustl.edu
        </a>
        .
      </p>
    </main>
  );
}
