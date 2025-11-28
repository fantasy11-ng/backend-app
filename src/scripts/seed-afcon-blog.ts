import { Command, CommandRunner } from 'nest-commander';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User, UserRole } from '@/modules/users/entities/user.entity';
import { PostEntity, PostStatus } from '@/modules/blog/entities/post.entity';
import { Category } from '@/modules/blog/entities/category.entity';
import { Tag } from '@/modules/blog/entities/tag.entity';

@Command({
  name: 'seed:afcon-blog',
  description: 'Seed AFCON 2025 related blog posts and tags',
})
export class SeedAfconBlogCommand extends CommandRunner {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(PostEntity)
    private readonly postsRepo: Repository<PostEntity>,
    @InjectRepository(Category)
    private readonly categoriesRepo: Repository<Category>,
    @InjectRepository(Tag)
    private readonly tagsRepo: Repository<Tag>,
  ) {
    super();
  }

  private async getAuthor() {
    // Prefer an admin/editor if available, otherwise fall back to the first user.
    const author =
      (await this.usersRepo.findOne({
        where: { role: UserRole.ADMIN },
      })) ||
      (await this.usersRepo.findOne({
        where: { role: UserRole.EDITOR },
      }));

    if (!author) {
      throw new Error(
        'No users found in the database. Please create a user before running this seed.',
      );
    }

    return author;
  }

  private async upsertCategory(slug: string, name: string) {
    let category = await this.categoriesRepo.findOne({ where: { slug } });
    if (!category) {
      category = this.categoriesRepo.create({ slug, name });
      await this.categoriesRepo.save(category);
    }
    return category;
  }

  private async upsertTag(slug: string, name: string) {
    let tag = await this.tagsRepo.findOne({ where: { slug } });
    if (!tag) {
      tag = this.tagsRepo.create({ slug, name });
      await this.tagsRepo.save(tag);
    }
    return tag;
  }

  private async upsertPost(input: {
    slug: string;
    title: string;
    content: string;
    excerpt: string;
    coverImageUrl: string;
    readingTimeMinutes?: number;
    author: User;
    category: Category | null;
    tags: Tag[];
  }) {
    let post = await this.postsRepo.findOne({
      where: { slug: input.slug },
      relations: ['tags', 'category', 'author'],
    });

    // Rough reading time estimate if not provided
    const words = (input.content || '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean).length;
    const readingTime =
      input.readingTimeMinutes ?? Math.max(1, Math.ceil(words / 200));

    if (!post) {
      post = this.postsRepo.create({
        slug: input.slug,
        title: input.title,
        content: input.content,
        excerpt: input.excerpt,
        coverImageUrl: input.coverImageUrl,
        readingTimeMinutes: readingTime,
        status: PostStatus.PUBLISHED,
        author: input.author,
        category: input.category,
        tags: input.tags,
      });
    } else {
      post.title = input.title;
      post.content = input.content;
      post.excerpt = input.excerpt;
      post.coverImageUrl = input.coverImageUrl;
      post.readingTimeMinutes = readingTime;
      post.status = PostStatus.PUBLISHED;
      post.author = input.author;
      post.category = input.category;
      post.tags = input.tags;
    }

    await this.postsRepo.save(post);
    // eslint-disable-next-line no-console
    console.log(`Seeded post: ${post.slug}`);
  }

  async run(): Promise<void> {
    const author = await this.getAuthor();
    const afconCategory = await this.upsertCategory('afcon-news', 'AFCON News');

    const tagAfcon = await this.upsertTag('afcon-2025', 'AFCON 2025');
    const tagMorocco = await this.upsertTag('morocco', 'Morocco');
    const tagSenegal = await this.upsertTag('senegal', 'Senegal');
    const tagAlgeria = await this.upsertTag('algeria', 'Algeria');
    const tagBafana = await this.upsertTag('bafana-bafana', 'Bafana Bafana');

    // 1) AFCON 2025 overview
    await this.upsertPost({
      slug: 'afcon-2025-morocco-hosts-tournament',
      title: 'AFCON 2025: Morocco Gears Up To Host Africa’s Biggest Football Festival',
      excerpt:
        'AFCON 2025 heads to Morocco from 21 December 2025 to 18 January 2026. Here is how the host nation is preparing its stadiums, cities and football culture for a month of elite African football.',
      coverImageUrl:
        'https://images.pexels.com/photos/114296/pexels-photo-114296.jpeg',
      author,
      category: afconCategory,
      tags: [tagAfcon, tagMorocco],
      content: `
<article>
  <header>
    <h1>AFCON 2025: Morocco Gears Up To Host Africa’s Biggest Football Festival</h1>
    <p class="meta">
      <span class="tag">AFCON 2025</span>
      <span class="date">Updated: 2025-11-28</span>
    </p>
    <figure class="hero">
      <img
        src="https://images.pexels.com/photos/114296/pexels-photo-114296.jpeg"
        alt="Stadium lit up at night ahead of a major football tournament"
        loading="lazy"
      />
      <figcaption>Morocco is preparing world-class venues for AFCON 2025.</figcaption>
    </figure>
  </header>

  <section>
    <p>
      The <strong>Africa Cup of Nations 2025</strong> (AFCON 2025) will be hosted by
      <strong>Morocco</strong> from <strong>21 December 2025</strong> to
      <strong>18 January 2026</strong>, bringing the continent’s best national teams
      to North Africa for a month of elite football.
    </p>
    <p>
      CAF confirmed the dates to align with both the African and European club calendars,
      giving players a proper preparation window and fans a festival of football over
      the year‑end period. With its modern stadiums, strong football culture and
      tourism infrastructure, Morocco is widely expected to deliver one of the most
      polished AFCON tournaments to date.
    </p>
  </section>

  <section>
    <h2>World-Class Venues Across Morocco</h2>
    <p>
      Matches are set to be spread across multiple host cities, with Casablanca,
      Rabat, Marrakech and Tangier among the key hubs under consideration.
      Moroccan authorities have been upgrading infrastructure, transport links and
      training facilities to meet CAF’s requirements and ensure a smooth experience
      for teams and supporters.
    </p>
    <p>
      Training bases, fan zones and media centres are being planned to accommodate
      the surge of visitors expected from across Africa and the diaspora.
      Local clubs and regional federations are also using the build‑up to strengthen
      youth and grassroots programmes.
    </p>
  </section>

  <section>
    <h2>Teams To Watch</h2>
    <ul>
      <li><strong>Senegal</strong> – The reigning powerhouse of West African football, built around a core of Europe‑based stars.</li>
      <li><strong>Morocco</strong> – The host nation, boosted by a golden generation that impressed at the 2022 World Cup.</li>
      <li><strong>Algeria</strong> – Eager to bounce back and prove their status among the continent’s elite.</li>
      <li><strong>Egypt</strong> – Record AFCON champions who are always contenders when knockout football begins.</li>
    </ul>
    <p>
      As the tournament approaches, more teams will book their places through
      the qualifying campaign, setting up fascinating group‑stage battles and
      potential heavyweight clashes in the knockouts.
    </p>
  </section>

  <section>
    <h2>What This Means For Fantasy & Predictors</h2>
    <p>
      With dates confirmed and hosts in place, fantasy football managers and
      predictor game players can start planning early. Fixture congestion, travel
      and mid‑season form will all influence how national team coaches set up,
      and that will feed directly into how fans build their brackets and match
      predictions inside the Fantasy11 app.
    </p>
  </section>
</article>
      `.trim(),
    });

    // 2) Power rankings post
    await this.upsertPost({
      slug: 'afcon-2025-power-rankings-senegal-morocco-algeria',
      title: 'AFCON 2025 Power Rankings: Senegal, Morocco and Algeria Lead the Pack',
      excerpt:
        'Early AFCON 2025 power rankings highlight Senegal, Morocco and Algeria as leading contenders, with several dark horses ready to upset the bracket.',
      coverImageUrl:
        'https://images.pexels.com/photos/1142965/pexels-photo-1142965.jpeg',
      author,
      category: afconCategory,
      tags: [tagAfcon, tagMorocco, tagSenegal, tagAlgeria],
      content: `
<article>
  <header>
    <h1>AFCON 2025 Power Rankings: Senegal, Morocco and Algeria Lead the Pack</h1>
    <p class="meta">
      <span class="tag">AFCON 2025</span>
      <span class="tag">Power Rankings</span>
      <span class="date">Updated: 2025-11-28</span>
    </p>
    <figure class="hero">
      <img
        src="https://images.pexels.com/photos/1142965/pexels-photo-1142965.jpeg"
        alt="Football players celebrating a goal in a stadium"
        loading="lazy"
      />
      <figcaption>Senegal, Morocco and Algeria are being tipped as early favourites for AFCON 2025.</figcaption>
    </figure>
  </header>

  <section>
    <p>
      With AFCON 2025 edging closer, conversations around
      <strong>tournament favourites</strong> are heating up. Coaches and pundits
      across the continent are already pointing to three standout contenders:
      <strong>Senegal</strong>, <strong>Morocco</strong> and <strong>Algeria</strong>.
    </p>
  </section>

  <section>
    <h2>Senegal: Consistency and Squad Depth</h2>
    <p>
      Senegal arrive with one of the most balanced squads in Africa. From a solid
      back line to technically gifted midfielders and powerful forwards, the Teranga
      Lions have depth in almost every position. Their recent tournament experience
      and strong mentality in knockouts make them a natural favourite.
    </p>
    <p>
      For predictor players, Senegal are often a safe choice to top their group and
      make a deep run, which is why many AFCON brackets start by locking them into
      at least the quarter‑finals.
    </p>
  </section>

  <section>
    <h2>Morocco: Hosts With a World Cup Pedigree</h2>
    <p>
      Morocco turned global heads with their historic World Cup semi‑final run,
      and many of that core group is expected to feature at AFCON 2025 on home soil.
      Backed by passionate home support and familiarity with local conditions,
      the Atlas Lions could be the team to beat.
    </p>
    <p>
      Home advantage typically translates into strong group‑stage performances and
      a boost during knockout ties. In prediction games, Morocco are a popular
      pick to reach the final when playing at home.
    </p>
  </section>

  <section>
    <h2>Algeria: Talented Squad With a Point to Prove</h2>
    <p>
      Algeria’s recent AFCON campaigns have been a mix of highs and frustration,
      but the talent level remains extremely high. If they can find the right balance
      between attack and control in midfield, the Desert Foxes have the tools
      to challenge anyone in Morocco.
    </p>
  </section>

  <section>
    <h2>Dark Horses To Keep An Eye On</h2>
    <p>
      Beyond the headline names, sides like <strong>DR Congo</strong>, 
      <strong>South Africa</strong>, and <strong>Ivory Coast</strong> are all being
      mentioned as potential spoilers. A favourable draw or a standout tournament
      from a key player could see one of these nations break into the late knockout
      rounds and upset the bracket.
    </p>
    <p>
      For Fantasy11 users, correctly identifying a dark horse early can be the
      difference between an average bracket and a tournament‑winning one.
    </p>
  </section>
</article>
      `.trim(),
    });

    // 3) Bafana Bafana preparation post
    await this.upsertPost({
      slug: 'bafana-bafana-afcon-2025-preparations',
      title: 'Bafana Bafana Step Up AFCON 2025 Preparations With Key Warm-Up Clashes',
      excerpt:
        'South Africa’s Bafana Bafana are using high‑intensity warm‑up fixtures and an emerging core of young talent to prepare for AFCON 2025 in Morocco.',
      coverImageUrl:
        'https://images.pexels.com/photos/399187/pexels-photo-399187.jpeg',
      author,
      category: afconCategory,
      tags: [tagAfcon, tagBafana],
      content: `
<article>
  <header>
    <h1>Bafana Bafana Step Up AFCON 2025 Preparations With Key Warm-Up Clashes</h1>
    <p class="meta">
      <span class="tag">South Africa</span>
      <span class="tag">AFCON 2025</span>
      <span class="date">Updated: 2025-11-28</span>
    </p>
    <figure class="hero">
      <img
        src="https://images.pexels.com/photos/399187/pexels-photo-399187.jpeg"
        alt="Football team in a huddle before kick-off"
        loading="lazy"
      />
      <figcaption>Bafana Bafana are using high‑intensity friendlies to sharpen up for AFCON 2025.</figcaption>
    </figure>
  </header>

  <section>
    <p>
      South Africa’s <strong>Bafana Bafana</strong> are ramping up preparations
      ahead of <strong>AFCON 2025 in Morocco</strong>, with a series of warm‑up
      fixtures designed to test both depth and tactical flexibility.
      The technical team has hinted that as much as <strong>80% of the squad</strong>
      used in key friendlies could form the core of the final AFCON group.
    </p>
  </section>

  <section>
    <h2>Key Players Pushing For Starting Roles</h2>
    <p>
      Attacking talents like <strong>Lyle Foster</strong> and emerging midfielders
      such as <strong>Yaya Sithole</strong> and <strong>Samukelo Kabini</strong>
      are expected to play central roles in South Africa’s plans. Their form 
      heading into the tournament will heavily influence how far Bafana Bafana
      can go against the continent’s heavyweights.
    </p>
    <p>
      Friendly clashes against strong opposition, including regional rivals,
      are being used to stress‑test game plans and give fringe players a chance
      to claim a seat on the plane to Morocco.
    </p>
  </section>

  <section>
    <h2>What To Watch As a Predictor Player</h2>
    <ul>
      <li><strong>Starting XI consistency</strong> – Does the coach settle on a clear core of players across friendlies?</li>
      <li><strong>Defensive solidity</strong> – Clean sheets in warm‑ups often translate into better odds of progression from the group stage.</li>
      <li><strong>Set‑piece threat</strong> – AFCON games can be tight; teams who are strong on corners and free‑kicks are valuable in prediction games.</li>
    </ul>
    <p>
      If Bafana Bafana maintain their recent momentum, they could emerge as one
      of the tournament’s surprise packages and a popular dark horse pick inside
      AFCON predictor games.
    </p>
  </section>

  <section>
    <h2>How Fantasy11 Will Cover Bafana Bafana</h2>
    <p>
      On Fantasy11, users will be able to:
    </p>
    <ul>
      <li>Track South Africa’s fixtures, line‑ups and form.</li>
      <li>Pick Bafana players in group predictions and knockout brackets.</li>
      <li>Compare their predictions against friends and the wider community.</li>
    </ul>
    <p>
      As AFCON 2025 approaches, expect more in‑depth previews, squad guides and
      tactical breakdowns for every participating nation.
    </p>
  </section>
</article>
      `.trim(),
    });

    // eslint-disable-next-line no-console
    console.log('AFCON blog seed completed');
  }
}


