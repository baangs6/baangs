"""Generate an isolated quotation PDF for visual QA, without database writes."""
from pathlib import Path
import pymupdf
from app.routers.quotations import Quote, calculate, render_pdf

if __name__ == '__main__':
    quote = Quote(customer_name='Example Customer', phone_number='8330033280',
        address='Thalassery, Kannur', quote_date='2026-10-12', validity_days=10,
        items=[dict(name='4 MP CCTV Camera', quantity=1, unit_price=6800, model='Outdoor bullet',
            warranty='2 years', description='Supply and installation of camera.'),
            dict(name='Cable and laying', quantity=100, unit_price=95, unit='metre', warranty='As per manufacturer')],
        terms='Payment: 50% advance before work commences; remaining 50% on completion.\nCable laying will be measured and billed as actuals in the final invoice.\nWarranty as specified per item. Excludes lightning, power surges, floods and physical damage.',
        notes='Thank you for considering Baangs Technomac LLP.')
    row = calculate(quote) | {'quote_id': 'QT-20261012-SAMPLE', 'prepared_by':'Admin'}
    path = Path('../tmp/pdfs/quotation-sample.pdf')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(render_pdf(row))
    doc = pymupdf.open(path)
    for i, page in enumerate(doc):
        page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5)).save(path.with_name(f'quotation-sample-{i+1}.png'))
    print(f'{len(doc)} page(s), total Rs {row["total"]:.2f}: {path.resolve()}')
