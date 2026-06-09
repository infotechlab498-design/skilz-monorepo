import React from 'react';

/**
 * @param {{ variant: 'left' | 'right' }} props
 */
export default function BlogCard({ variant }) {
  if (variant === 'right') {
    return (
      <article className="dsh-crd dsh-blg dsh-blgR">
        <div className="dsh-blgOv">
          <h3 className="dsh-blgH">Work with the rockets</h3>
          <p className="dsh-blgP">
            Wealth creation is an evolutionarily recent positive-sum game. It is all about who
            take the opportunity first.
          </p>
          <button type="button" className="dsh-btn dsh-btnLink">
            Read More →
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="dsh-crd dsh-blg dsh-blgL">
      <div className="dsh-blgTx">
        <p className="dsh-blgTop">Built by developers</p>
        <h3 className="dsh-blgH dsh-blgHdk">Soft UI Dashboard</h3>
        <p className="dsh-blgP dsh-blgPdk">
          From colors, cards, typography to complex elements, you will find the full documentation.
        </p>
        <button type="button" className="dsh-btn dsh-btnLink dsh-btnDk">
          Read More →
        </button>
      </div>
      <div className="dsh-rkt" aria-hidden="true">
        🚀
      </div>
    </article>
  );
}

