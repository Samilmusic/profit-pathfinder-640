import { createFileRoute } from "@tanstack/react-router";
import { COMPANY, CONTACT_LINKS, seo } from "@/lib/site";
import { LegalPage } from "@/components/site/legal";

export const Route = createFileRoute("/_site/terms-and-conditions")({
  head: () =>
    seo({
      path: "/terms-and-conditions",
      title: "Terms & Conditions | AL NOKHBA TRADING",
      description:
        "Terms and conditions governing the use of alnokhbatrading.com, the corporate website of AL NOKHBA AL MASIYA GOODS WHOLESALERS L.L.C, Dubai, UAE.",
      ogTitle: "Terms & Conditions — AL NOKHBA TRADING",
      ogDescription: "Website terms and conditions for AL NOKHBA TRADING.",
    }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms & Conditions"
      updated="October 2026"
      intro={
        <p>
          These Terms & Conditions govern your use of {COMPANY.domain} (the “Website”), operated by{" "}
          {COMPANY.legalName} (“AL NOKHBA”, “we”, “us”). By using the Website you agree to these
          terms. If you do not agree, please do not use the Website.
        </p>
      }
      sections={[
        {
          title: "Company information",
          body: (
            <p>
              {COMPANY.legalName} is registered in Dubai, United Arab Emirates, under Trade Licence
              No. {COMPANY.licenceNo}, licensed activity: {COMPANY.activity}. Registered address:{" "}
              {COMPANY.addressLine1}, {COMPANY.city}, {COMPANY.country}.
            </p>
          ),
        },
        {
          title: "Purpose of the website",
          body: (
            <p>
              The Website provides general information about AL NOKHBA's business activities and
              enables manufacturers, exporters, wholesalers and other businesses to contact us. It
              is intended for business users. The Website is not an online shop and no goods are
              sold through it.
            </p>
          ),
        },
        {
          title: "No offer or commitment",
          body: (
            <p>
              Information on the Website is provided for general information only. Nothing on the
              Website constitutes an offer, a purchase order, or a commitment by AL NOKHBA to
              purchase any goods or enter into any agreement. Submitting a supplier proposal or
              enquiry does not create a contractual relationship. Any purchase is subject to a
              separate written agreement or purchase order issued by AL NOKHBA, and to the
              commercial terms agreed in it.
            </p>
          ),
        },
        {
          title: "Information you submit",
          body: (
            <>
              <p>When you submit information or documents through the Website, you confirm that:</p>
              <ul>
                <li>
                  the information is accurate and you are authorised to share it on behalf of your
                  company;
                </li>
                <li>
                  you have the right to share any catalogues, product lists or other documents you
                  upload, and they do not contain malicious code;
                </li>
                <li>
                  AL NOKHBA may use the information to evaluate potential business opportunities, as
                  described in our Privacy Policy.
                </li>
              </ul>
              <p>
                We treat commercial information received from suppliers with discretion and use it
                only for evaluating and managing the potential business relationship.
              </p>
            </>
          ),
        },
        {
          title: "Intellectual property",
          body: (
            <p>
              The Website's content, design and the {COMPANY.brand} name and wordmark are owned by
              or licensed to AL NOKHBA. You may view and print pages for your internal business
              purposes, but you may not reproduce, distribute or modify Website content for
              commercial purposes without our prior written consent. Photographs used on the Website
              are licensed stock imagery and are illustrative only.
            </p>
          ),
        },
        {
          title: "Third-party links",
          body: (
            <p>
              The Website may contain links to third-party services (for example WhatsApp). We are
              not responsible for the content, availability or practices of third-party services.
            </p>
          ),
        },
        {
          title: "Limitation of liability",
          body: (
            <p>
              The Website is provided on an “as is” and “as available” basis. To the extent
              permitted by applicable law, AL NOKHBA makes no warranties regarding the Website's
              accuracy, completeness or availability and is not liable for any loss arising from the
              use of, or reliance on, the Website or its content.
            </p>
          ),
        },
        {
          title: "Acceptable use",
          body: (
            <p>
              You must not misuse the Website, including by attempting to gain unauthorised access,
              interfering with its operation, submitting false or misleading information, or sending
              unsolicited bulk communications through its forms.
            </p>
          ),
        },
        {
          title: "Governing law and jurisdiction",
          body: (
            <p>
              These terms are governed by the laws of the Emirate of Dubai and the applicable
              federal laws of the United Arab Emirates. The courts of Dubai shall have jurisdiction
              over any dispute arising from the use of the Website.
            </p>
          ),
        },
        {
          title: "Changes and contact",
          body: (
            <p>
              We may update these terms from time to time; the current version is published on this
              page. Questions about these terms may be sent to{" "}
              <a href={CONTACT_LINKS.email}>{COMPANY.email}</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
