# db/seeds.rb — seed Rails `Customer` records with fictional people.
# Run: bin/rails db:seed
#
# create_table :customers do |t|
#   t.string :external_id, :full_name, :customer_number, :phone, :company, :income_band, :customer_since
#   t.string :email, null: false, index: { unique: true }
#   t.jsonb :address
# end
require "net/http"
require "json"

uri = URI("https://shaqsiyad.example/api/v1/fixtures?shape=customers&count=100&seed=4")
res = Net::HTTP.get_response(uri)
raise "Shaqsiyad: #{res.code}" unless res.is_a?(Net::HTTPSuccess)

people = JSON.parse(res.body)
people.each do |p|
  Customer.find_or_initialize_by(email: p["email"]).update!(
    external_id: p["id"],
    full_name: p["fullName"],
    customer_number: p["customerNumber"],
    phone: p["phone"],
    address: p["address"],
    company: p["company"],
    income_band: p["incomeBand"],
    customer_since: p["customerSince"]
  )
end
puts "Seeded #{people.size} customers"
