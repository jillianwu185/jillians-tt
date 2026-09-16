export const metadata = {
  title: "Terms of Service — Jillian's Auto-Editor",
};

export default function TermsOfService() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-sm leading-7 text-neutral-800">
      <h1 className="mb-2 text-2xl font-semibold text-neutral-900">Terms of Service</h1>
      <p className="mb-8 text-neutral-500">Last updated: September 16, 2026</p>

      <p className="mb-6">
        Jillian&apos;s Auto-Editor (&quot;the app&quot;) is a personal, single-user application
        built and operated by Jillian Wu for her own use editing video content and
        reviewing her own TikTok account performance. It is not made available to the
        public, does not support third-party accounts, and is not offered as a
        commercial service.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold text-neutral-900">Use of the app</h2>
      <p className="mb-6">
        The app is intended solely for use by its owner. It processes video content
        and account data belonging to the owner, and connects to the owner&apos;s own
        TikTok account via TikTok&apos;s official Login Kit and Display API, in
        accordance with TikTok&apos;s Developer Terms of Service and API Terms of Use.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold text-neutral-900">Content ownership</h2>
      <p className="mb-6">
        All video content, transcripts, and edits processed by the app remain the sole
        property of the app owner. The app does not claim any ownership or license over
        this content beyond what is required to operate (e.g. temporary storage and
        processing for rendering).
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold text-neutral-900">No warranty</h2>
      <p className="mb-6">
        The app is provided &quot;as is,&quot; as a personal project, without warranty of any
        kind. It is not intended for use by anyone other than its owner and is not
        supported as a commercial product.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold text-neutral-900">Contact</h2>
      <p>
        Questions can be sent to{" "}
        <a className="underline" href="mailto:jillian.w@wustl.edu">
          jillian.w@wustl.edu
        </a>
        .
      </p>
    </main>
  );
}
