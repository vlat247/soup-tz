import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.main}>
      <h1>Soup Training Monitor</h1>
      <p>
        Project setup is complete. The training-run monitor is the next
        implementation milestone.
      </p>
      <p>
        This starter does not contain training data or charts. Product requirements
        and the technical implementation plan are available in the repository.
      </p>
      <dl className={styles.documents}>
        <div>
          <dt>Product requirements</dt>
          <dd>
            <code>docs/PRD.md</code>
          </dd>
        </div>
        <div>
          <dt>Technical requirements</dt>
          <dd>
            <code>docs/TRD.md</code>
          </dd>
        </div>
      </dl>
    </main>
  );
}
