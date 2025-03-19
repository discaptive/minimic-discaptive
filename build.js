import fs from "fs";
import path from "path";
import matter from "gray-matter";
import yaml from "js-yaml";
import { marked } from "marked";

const CONTENT_DIR = "content";
const OUTPUT_DIR = "public";
const TEMPLATE_DIR = "templates";
const CONFIG_PATH = "config.yaml";

const config = yaml.load(fs.readFileSync(CONFIG_PATH, "utf-8"));

function loadTemplate(template) {
  return fs.readFileSync(path.join(TEMPLATE_DIR, `${template}.html`), "utf-8");
}

function renderTemplate(template, variables) {
  return template.replace(/{{(\w+)}}/g, (_, key) => variables[key] || "");
}

function cleanDirectory(directory, excludeFiles = []) {
  if (!fs.existsSync(directory)) return;

  const files = fs.readdirSync(directory);

  files.forEach((file) => {
    const filePath = path.join(directory, file);

    if (excludeFiles.includes(file)) {
      return;
    }

    if (fs.statSync(filePath).isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
  });
}

function generateIndexPage() {
  const layoutTemplate = loadTemplate("layout");
  const headerTemplate = loadTemplate("header");
  const footerTemplate = loadTemplate("footer");

  const postListTemplate = loadTemplate("post-list");
  const postItemTemplate = loadTemplate("post-item");

  const header = renderTemplate(headerTemplate, {
    name: config.name,
    github: config.github,
  });

  const footer = renderTemplate(footerTemplate, {
    year: new Date().getFullYear(),
    name: config.name,
  });

  const postDirs = fs.readdirSync(CONTENT_DIR);

  const postItems = postDirs
    .map((dir) => {
      const postPath = path.join(CONTENT_DIR, dir, "index.md");
      if (!fs.existsSync(postPath)) return "";

      const { data: metadata, content: content } = matter(
        fs.readFileSync(postPath, "utf-8")
      );

      const postDate = new Date(metadata.date);

      return {
        date: postDate,
        html: renderTemplate(postItemTemplate, {
          localeDate: postDate.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
          title: metadata.title,
          preview: marked(content)
            .replace(/<[^>]*>/g, "")
            .slice(0, 300),
          slug: dir,
        }),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.date - a.date)
    .map((post) => post.html)
    .join("\n");

  const content = renderTemplate(postListTemplate, {
    name: config.name,
    posts: postItems,
  });

  const page = renderTemplate(layoutTemplate, {
    header,
    footer,
    content,
    title: config.name,
    description: `All the latest ${config.name} posts, straight from the head.`,
    base: config.base,
    slug: "/",
    image: "/logo.png",
  });

  fs.writeFileSync(path.join(OUTPUT_DIR, "index.html"), page);
}

function generatePostPage() {
  const layoutTemplate = loadTemplate("layout");
  const headerTemplate = loadTemplate("header");
  const footerTemplate = loadTemplate("footer");

  const postDetailTemplate = loadTemplate("post-detail");

  const header = renderTemplate(headerTemplate, {
    name: config.name,
    github: config.github,
  });

  const footer = renderTemplate(footerTemplate, {
    year: new Date().getFullYear(),
    name: config.name,
  });

  const postDirs = fs.readdirSync(CONTENT_DIR);

  postDirs.forEach((dir) => {
    const postPath = path.join(CONTENT_DIR, dir);
    const postFiles = fs.readdirSync(postPath);

    const indexPath = path.join(postPath, "index.md");
    if (!fs.existsSync(indexPath)) return;

    const outputDir = path.join(OUTPUT_DIR, dir);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    postFiles.forEach((file) => {
      if (file !== "index.md") {
        const srcPath = path.join(postPath, file);
        const destPath = path.join(outputDir, file);
        fs.copyFileSync(srcPath, destPath);
      }
    });

    const { data: metadata, content: content } = matter(
      fs.readFileSync(indexPath, "utf-8")
    );

    const adjustImagePaths = (htmlContent) => {
      return htmlContent.replace(/<img src="([^"]+)"/g, (match, src) => {
        if (src.startsWith("http")) {
          return match;
        }

        const newSrc = path.join(dir, src).replace(/\\/g, "/");
        return `<img src="${newSrc}"`;
      });
    };

    const postContent = renderTemplate(postDetailTemplate, {
      localeDate: new Date(metadata.date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      date: metadata.date,
      title: metadata.title,
      github: config.github,
      name: config.name,
      content: adjustImagePaths(marked(content)),
      repo: config.giscus.repo,
      repoId: config.giscus.repoId,
      category: config.giscus.category,
      categoryId: config.giscus.categoryId,
      mapping: config.giscus.mapping,
      reactionsEnabled: config.giscus.reactionsEnabled,
      inputPosition: config.giscus.inputPosition,
      theme: config.giscus.theme,
      lang: config.giscus.lang,
    });

    const page = renderTemplate(layoutTemplate, {
      header,
      footer,
      content: postContent,
      title: `${metadata.title} - ${config.name}`,
      description: marked(content)
        .replace(/<[^>]*>/g, "")
        .slice(0, 120),
      base: config.base,
      slug: `/${dir}`,
      image: "/logo.png",
    });

    fs.writeFileSync(path.join(outputDir, "index.html"), page);
  });
}

function generateSitemap() {
  const postDirs = fs.readdirSync(CONTENT_DIR);

  const urls = postDirs
    .map((dir) => {
      const postPath = path.join(CONTENT_DIR, dir);
      const indexPath = path.join(postPath, "index.md");

      if (!fs.existsSync(indexPath)) return null;

      const postUrl = `/${dir}`;
      return {
        loc: `${config.base}${postUrl}`,
        lastmod: new Date(
          matter(fs.readFileSync(indexPath, "utf-8")).data.date
        ).toISOString(),
      };
    })
    .filter(Boolean);

  const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${urls
      .map(
        (url) => `
      <url>
        <loc>${url.loc}</loc>
        <lastmod>${url.lastmod}</lastmod>
      </url>`
      )
      .join("")}
  </urlset>`;

  fs.writeFileSync(path.join(OUTPUT_DIR, "sitemap.xml"), sitemapContent);
}

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR);
}

cleanDirectory("public", ["styles", "favicon.ico", "logo.png", "robots.txt"]);
generateIndexPage();
generatePostPage();
generateSitemap();
