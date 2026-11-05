import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  MetricCard,
  Chip,
  SidebarItem,
  TopAppBar,
  TopAppBarIconButton,
  PageHeader,
  EmptyState,
  Skeleton,
  SkeletonText,
  Input,
  Textarea,
  Select,
  Modal,
  Icon,
} from '../../components/stitch'
import { useState } from 'react'

function Section({ id, title, description, children }) {
  return (
    <section id={id} className="space-y-md">
      <div>
        <h2 className="font-headline-md text-headline-md text-on-surface">{title}</h2>
        {description && (
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs">
            {description}
          </p>
        )}
      </div>
      <div>{children}</div>
    </section>
  )
}

export default function DesignPreview() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background text-on-background">
      <TopAppBar
        title="Design Preview"
        leading={<Icon name="palette" size={24} className="text-primary" />}
        nav={
          <>
            <a href="#tokens" className="font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Tokens</a>
            <a href="#buttons" className="font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Buttons</a>
            <a href="#cards" className="font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cards</a>
            <a href="#forms" className="font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Forms</a>
          </>
        }
        trailing={
          <>
            <TopAppBarIconButton icon="notifications" label="Notifications" />
            <TopAppBarIconButton icon="settings" label="Settings" />
            <Button variant="primary" size="sm">Create Brief</Button>
          </>
        }
      />

      <main className="max-w-6xl mx-auto px-md py-lg space-y-lg">
        <PageHeader
          eyebrow="Stitch / PropTech Trust Systems"
          title="Design Foundations Kitchen Sink"
          description="Every primitive in the new design language, rendered on a bg-surface background. Use this page to eyeball-test changes against the Stitch HTML before rolling them out."
          actions={
            <>
              <Button variant="ghost" icon="open_in_new">View Stitch HTML</Button>
              <Button variant="primary" icon="add">Add Component</Button>
            </>
          }
        />

        {/* TOKENS */}
        <Section id="tokens" title="Color tokens" description="Surface and key role tokens from DESIGN.md.">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-sm">
            {[
              ['surface', 'bg-surface'],
              ['surface-container-low', 'bg-surface-container-low'],
              ['surface-container', 'bg-surface-container'],
              ['surface-container-high', 'bg-surface-container-high'],
              ['surface-variant', 'bg-surface-variant'],
              ['primary', 'bg-primary text-on-primary'],
              ['primary-container', 'bg-primary-container text-on-primary-container'],
              ['secondary', 'bg-secondary text-on-secondary'],
              ['secondary-container', 'bg-secondary-container text-on-secondary-container'],
              ['tertiary', 'bg-tertiary text-on-tertiary'],
              ['error', 'bg-error text-on-error'],
              ['error-container', 'bg-error-container text-on-error-container'],
            ].map(([name, cls]) => (
              <div
                key={name}
                className={`rounded border border-outline-variant px-sm py-md font-label-md text-label-md ${cls}`}
              >
                {name}
              </div>
            ))}
          </div>
        </Section>

        {/* TYPOGRAPHY */}
        <Section id="typography" title="Typography scale" description="Inter, all weights from Google Fonts.">
          <Card padding="md">
            <div className="space-y-sm">
              <div className="font-headline-xl text-headline-xl text-on-surface">headline-xl — 40 / 48 / 700</div>
              <div className="font-headline-lg text-headline-lg text-on-surface">headline-lg — 32 / 40 / 600</div>
              <div className="font-headline-md text-headline-md text-on-surface">headline-md — 24 / 32 / 600</div>
              <div className="font-body-lg text-body-lg text-on-surface">body-lg — 18 / 28 / 400</div>
              <div className="font-body-md text-body-md text-on-surface">body-md — 16 / 24 / 400</div>
              <div className="font-body-sm text-body-sm text-on-surface-variant">body-sm — 14 / 20 / 400</div>
              <div className="font-label-lg text-label-lg uppercase tracking-wider text-on-surface-variant">label-lg — 14 / 20 / 600</div>
              <div className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">label-md — 12 / 16 / 500</div>
              <div className="font-data-mono text-data-mono text-on-surface">data-mono — 14 / 20 / 500 (R 1,234,567.00)</div>
            </div>
          </Card>
        </Section>

        {/* BUTTONS */}
        <Section id="buttons" title="Buttons" description="primary | secondary | ghost | destructive — three sizes.">
          <Card padding="md">
            <div className="space-y-md">
              {['sm', 'md', 'lg'].map((size) => (
                <div key={size} className="flex flex-wrap items-center gap-sm">
                  <span className="font-label-md text-label-md text-on-surface-variant w-10">{size}</span>
                  <Button size={size} variant="primary" icon="add">Primary</Button>
                  <Button size={size} variant="secondary">Secondary</Button>
                  <Button size={size} variant="ghost" iconRight="arrow_forward">Ghost</Button>
                  <Button size={size} variant="destructive" icon="delete">Destructive</Button>
                  <Button size={size} variant="primary" disabled>Disabled</Button>
                </div>
              ))}
            </div>
          </Card>
        </Section>

        {/* CARDS */}
        <Section id="cards" title="Cards" description="Default flat outline + elevated ambient-shadow variant.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <Card>
              <CardHeader>
                <CardTitle>Flat card</CardTitle>
                <CardDescription>1px outline-variant border, no shadow. The default surface.</CardDescription>
              </CardHeader>
              <CardContent>
                Use this for property listings, data modules, and most dashboard panels.
              </CardContent>
              <CardFooter>
                <div className="flex items-center justify-between w-full">
                  <Chip tone="primary" icon="check">Verified</Chip>
                  <Button variant="ghost" size="sm" iconRight="arrow_forward">Learn more</Button>
                </div>
              </CardFooter>
            </Card>

            <Card elevated>
              <CardHeader>
                <CardTitle>Elevated card</CardTitle>
                <CardDescription>Same outline + the canonical .ambient-shadow utility (4px / 24px / 6%).</CardDescription>
              </CardHeader>
              <CardContent>
                Reserve elevation for hovered hero elements, modals, and floating data overlays.
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* METRIC CARDS */}
        <Section id="metrics" title="Metric cards" description="KPI tiles with optional trend chips.">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
            <MetricCard
              label="Active campaigns"
              value="12"
              helper="vs last month"
              trend="+18%"
              trendDirection="positive"
              icon="campaign"
            />
            <MetricCard
              label="Leads generated"
              value="1,284"
              helper="this quarter"
              trend="+342%"
              trendDirection="positive"
              icon="trending_up"
            />
            <MetricCard
              label="Cost per lead"
              value="R 142"
              helper="vs target R 180"
              trend="-21%"
              trendDirection="negative"
              icon="payments"
            />
            <MetricCard
              label="Pending payouts"
              value="R 48,200"
              helper="awaiting release"
              trend="No change"
              trendDirection="neutral"
              icon="account_balance_wallet"
            />
          </div>
        </Section>

        {/* CHIPS */}
        <Section id="chips" title="Chips" description="Status, filter, and tag chips. Light tonal background, dark text.">
          <Card padding="md">
            <div className="flex flex-wrap gap-sm">
              <Chip tone="neutral">Draft</Chip>
              <Chip tone="primary" icon="check">Active</Chip>
              <Chip tone="secondary" icon="task_alt">Approved</Chip>
              <Chip tone="tertiary" icon="schedule">Scheduled</Chip>
              <Chip tone="success" icon="check_circle">Funded</Chip>
              <Chip tone="warning" icon="warning">Action needed</Chip>
              <Chip tone="danger" icon="error">Disputed</Chip>
              <Chip tone="primary" onRemove={() => {}}>Cape Town</Chip>
            </div>
          </Card>
        </Section>

        {/* SIDEBAR + APPBAR PREVIEW */}
        <Section id="navigation" title="Navigation primitives" description="Sidebar items + TopAppBar pieces.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
            <Card padding="sm" className="md:col-span-1">
              <div className="px-sm pb-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                Sidebar
              </div>
              <nav className="space-y-xs">
                <SidebarItem icon="dashboard" label="Dashboard" active />
                <SidebarItem icon="campaign" label="Campaigns" badge={4} />
                <SidebarItem icon="people" label="Creators" />
                <SidebarItem icon="leaderboard" label="Analytics" />
                <SidebarItem icon="account_balance_wallet" label="Wallet" />
                <SidebarItem icon="settings" label="Settings" />
              </nav>
            </Card>

            <Card padding="none" className="md:col-span-2 overflow-hidden">
              <TopAppBar
                title="Campaign manager"
                sticky={false}
                trailing={
                  <>
                    <TopAppBarIconButton icon="search" label="Search" />
                    <TopAppBarIconButton icon="notifications" label="Notifications" />
                    <Button size="sm" variant="primary" icon="add">New campaign</Button>
                  </>
                }
              />
              <div className="p-md font-body-sm text-body-sm text-on-surface-variant">
                Embedded TopAppBar — sits above page content with backdrop blur.
              </div>
            </Card>
          </div>
        </Section>

        {/* FORMS */}
        <Section id="forms" title="Form fields" description="Input, Textarea, Select — all share the same Stitch field skin.">
          <Card padding="md">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <Input label="Campaign name" placeholder="e.g. Steyn City Spring Launch" defaultValue="Pam Golding Sandton Drive" />
              <Input label="Budget (ZAR)" placeholder="0" type="number" helperText="Excludes 25% platform fee" />
              <Select
                label="Property type"
                placeholder="Select a type…"
                options={[
                  { value: 'apartment', label: 'Apartment' },
                  { value: 'house', label: 'House' },
                  { value: 'estate', label: 'Estate' },
                  { value: 'commercial', label: 'Commercial' },
                ]}
              />
              <Input label="Launch date" type="date" />
              <div className="md:col-span-2">
                <Textarea
                  label="Brief"
                  placeholder="What should creators know about this listing?"
                  rows={4}
                />
              </div>
              <Input label="Required field" error="This field is required" placeholder="Try focusing me" />
              <Input label="With helper" helperText="We'll never share this with creators." placeholder="email@example.com" />
            </div>
          </Card>
        </Section>

        {/* EMPTY + LOADING */}
        <Section id="states" title="Empty + loading states" description="What pages should look like before data lands.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <Card>
              <EmptyState
                icon="inbox"
                title="No campaigns yet"
                description="Spin up your first campaign and assign vetted creators in under five minutes."
                action={<Button variant="primary" icon="add">Create campaign</Button>}
              />
            </Card>

            <Card>
              <div className="flex items-center gap-md mb-md">
                <Skeleton className="w-12 h-12 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-1/2 mb-xs" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <SkeletonText lines={3} />
              <div className="mt-md flex gap-sm">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-24" />
              </div>
            </Card>
          </div>
        </Section>

        {/* MODAL */}
        <Section id="modal" title="Modal" description="Dialog over scrim with ambient-shadow elevation.">
          <Card padding="md">
            <Button variant="primary" icon="open_in_new" onClick={() => setModalOpen(true)}>
              Open modal
            </Button>
          </Card>

          <Modal
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Approve content submission"
            description="Releasing this approval triggers payout to the creator."
            size="md"
            footer={
              <>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={() => setModalOpen(false)}>Approve</Button>
              </>
            }
          >
            <p className="font-body-md text-body-md text-on-surface">
              Once approved, the creator can no longer edit this submission, and the
              campaign budget will be debited within two business days.
            </p>
          </Modal>
        </Section>

        <div className="pt-lg pb-xl text-center font-body-sm text-body-sm text-on-surface-variant">
          PropTech Trust Systems — design foundations preview · dev only
        </div>
      </main>
    </div>
  )
}
