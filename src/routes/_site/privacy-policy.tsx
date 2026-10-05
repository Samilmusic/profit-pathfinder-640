import { createFileRoute } from "@tanstack/react-router";
import { COMPANY, CONTACT_LINKS, seo } from "@/lib/site";
import { LegalPage } from "@/components/site/legal";

export const Route = createFileRoute("/_site/privacy-policy")({
  head: () =>
    seo({
      path: "/privacy-policy",
      title: "Privacy Policy | AL NOKHBA TRADING",
      description:
        "How AL NOKHBA AL MASIYA GOODS WHOLESALERS L.L.C collects, uses and protects business contact information submitted through alnokhbatrading.com.",
      ogTitle: "Privacy Policy — AL NOKHBA TRADING",
      ogDescription: "Privacy Policy for the AL NOKHBA TRADING corporate website.",
    }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      updated="October 2026"
      intro={
        <p>
          This Privacy Policy explains how {COMPANY.legalName} (“AL NOKHBA”, “we”, “us”), operating
          under the {COMPANY.brand} brand, handles information received through {COMPANY.domain} and
          related business correspondence. This website is intended for business-to-business use.
        </p>
      }
      sections={[
        {
          title: "Who we are",
          body: (
            <p>
              {COMPANY.legalName} is a company registered in Dubai, United Arab Emirates (Trade
              Licence No. {COMPANY.licenceNo}), with its registered address at{" "}
              {COMPANY.addressLine1}, {COMPANY.city}, {COMPANY.country}. For any privacy matter,
              contact us at <a href={CONTACT_LINKS.email}>{COMPANY.email}</a>.
            </p>
          ),
        },
        {
          title: "Information we collect",
          body: (
            <>
              <p>We collect information that you choose to provide to us, including:</p>
              <ul>
                <li>
                  Business contact details such as your name, job title, company name, country,
                  company website, business email address and telephone / WhatsApp number;
                </li>
                <li>
                  Commercial information about your company and products, such as product
                  categories, brands, export markets, MOQ, lead times, stock availability and
                  indicative order values;
                </li>
                <li>
                  Documents you upload or send to us, such as catalogues, product lists and price
                  lists;
                </li>
                <li>
                  The content of messages and correspondence you send to us by email, telephone or
                  WhatsApp.
                </li>
              </ul>
              <p>
                Like most websites, our hosting infrastructure may also process limited technical
                data (such as IP address, browser type and request logs) for security and
                reliability purposes.
              </p>
            </>
          ),
        },
        {
          title: "How we use information",
          body: (
            <>
              <p>We use the information we receive to:</p>
              <ul>
                <li>
                  Evaluate supplier proposals and potential sourcing and purchasing opportunities;
                </li>
                <li>
                  Respond to enquiries and communicate with you about commercial discussions,
                  meetings and visits;
                </li>
                <li>
                  Prepare, negotiate and administer purchase orders and related trade documentation;
                </li>
                <li>Maintain the security and proper operation of this website;</li>
                <li>
                  Comply with applicable legal and regulatory obligations in the United Arab
                  Emirates.
                </li>
              </ul>
              <p>
                We do not sell personal information, and we do not use it for unrelated marketing
                purposes.
              </p>
            </>
          ),
        },
        {
          title: "Legal basis",
          body: (
            <p>
              We process business contact information in connection with taking steps at your
              request prior to entering into a commercial relationship, for our legitimate business
              interests in sourcing and procurement, and where required to comply with the law, in
              line with applicable UAE data protection legislation.
            </p>
          ),
        },
        {
          title: "Sharing of information",
          body: (
            <p>
              Information is accessed by AL NOKHBA personnel involved in procurement and supplier
              relations. We may share information with service providers who support our business
              operations (such as website hosting, email delivery and logistics or freight partners
              when coordinating shipments), and with authorities where required by law. Service
              providers may process information outside the United Arab Emirates.
            </p>
          ),
        },
        {
          title: "Third-party services on this website",
          body: (
            <p>
              This website loads web fonts and photographs from third-party content delivery
              networks, and links to external services such as WhatsApp. When you use those
              services, their own privacy policies apply.
            </p>
          ),
        },
        {
          title: "Retention",
          body: (
            <p>
              We keep supplier and enquiry information for as long as reasonably necessary to
              evaluate and manage the business relationship, and thereafter as required for legal,
              accounting or record-keeping purposes.
            </p>
          ),
        },
        {
          title: "Security",
          body: (
            <p>
              We take reasonable technical and organisational measures to protect information
              against unauthorised access, loss or misuse. No method of transmission over the
              internet is completely secure.
            </p>
          ),
        },
        {
          title: "Your rights",
          body: (
            <p>
              Subject to applicable law, you may request access to, correction of, or deletion of
              personal information we hold about you, or object to its processing, by writing to{" "}
              <a href={CONTACT_LINKS.email}>{COMPANY.email}</a>.
            </p>
          ),
        },
        {
          title: "Changes to this policy",
          body: (
            <p>
              We may update this Privacy Policy from time to time. The current version is always
              available on this page, with the date of the latest update shown above.
            </p>
          ),
        },
      ]}
    />
  );
}
